package main

import (
	"log"
	"math"
	"strconv"
	"sync"
	"time"
)

const (
	DefaultTargetDropRate   = 0.03
	DefaultMinFactor        = 1.0
	DefaultMaxFactor        = 4.0
	DefaultAdaptIntervalMs  = 10000
	DefaultSlidingWindowSec = 300
	MinSamplesBeforeAdapt   = 20
)

type PredictiveConfig struct {
	TargetDropRate  float64
	MinFactor       float64
	MaxFactor       float64
	AdaptIntervalMs int
	SlidingWindowSec int
}

type PredictiveState struct {
	mu              sync.Mutex
	perCampaign     map[string]*CampaignPredictiveState
}

type CampaignPredictiveState struct {
	Factor          float64
	LastAdaptTime   time.Time
	Attempts        int
	Answers         int
	Drops           int
	ActiveCount     int
	WaitingCount    int
}

func NewPredictiveState() *PredictiveState {
	return &PredictiveState{
		perCampaign: make(map[string]*CampaignPredictiveState),
	}
}

func (ps *PredictiveState) GetFactor(campaignID string, config PredictiveConfig) float64 {
	ps.mu.Lock()
	defer ps.mu.Unlock()

	state, exists := ps.perCampaign[campaignID]
	if !exists {
		state = &CampaignPredictiveState{
			Factor:        config.MinFactor,
			LastAdaptTime: time.Now(),
		}
		ps.perCampaign[campaignID] = state
	}

	return state.Factor
}

func (ps *PredictiveState) UpdateStats(campaignID string, attempts, answers, drops int) {
	ps.mu.Lock()
	defer ps.mu.Unlock()

	state, exists := ps.perCampaign[campaignID]
	if !exists {
		state = &CampaignPredictiveState{
			Factor:        1.0,
			LastAdaptTime: time.Now(),
		}
		ps.perCampaign[campaignID] = state
	}

	state.Attempts += attempts
	state.Answers += answers
	state.Drops += drops
}

func (ps *PredictiveState) AdaptFactor(campaignID string, config PredictiveConfig) float64 {
	ps.mu.Lock()
	defer ps.mu.Unlock()

	state, exists := ps.perCampaign[campaignID]
	if !exists {
		state = &CampaignPredictiveState{
			Factor:        config.MinFactor,
			LastAdaptTime: time.Now(),
		}
		ps.perCampaign[campaignID] = state
		return state.Factor
	}

	if config.TargetDropRate <= 0 {
		config.TargetDropRate = DefaultTargetDropRate
	}
	if config.MinFactor <= 0 {
		config.MinFactor = DefaultMinFactor
	}
	if config.MaxFactor <= 0 {
		config.MaxFactor = DefaultMaxFactor
	}
	if config.MaxFactor < config.MinFactor {
		config.MaxFactor = config.MinFactor * 2
	}

	attempts := state.Attempts
	answers := state.Answers
	drops := state.Drops

	if attempts < MinSamplesBeforeAdapt {
		return state.Factor
	}

	dropRate := float64(drops) / float64(attempts)
	answerRate := float64(answers) / float64(attempts)

	oldFactor := state.Factor
	newFactor := state.Factor

	if dropRate > config.TargetDropRate*1.5 {
		newFactor = state.Factor * 0.80
	} else if dropRate > config.TargetDropRate*1.2 {
		newFactor = state.Factor * 0.88
	} else if dropRate > config.TargetDropRate {
		newFactor = state.Factor * 0.94
	} else if dropRate < config.TargetDropRate*0.3 {
		if answerRate > 0.15 {
			newFactor = state.Factor * 1.06
		} else {
			newFactor = state.Factor * 1.03
		}
	} else if dropRate < config.TargetDropRate*0.6 {
		newFactor = state.Factor * 1.03
	} else {
		newFactor = state.Factor * 1.01
	}

	if newFactor > config.MaxFactor {
		newFactor = config.MaxFactor
	}
	if newFactor < config.MinFactor {
		newFactor = config.MinFactor
	}

	newFactor = math.Round(newFactor*100) / 100

	state.Factor = newFactor
	state.LastAdaptTime = time.Now()

	state.Attempts = 0
	state.Answers = 0
	state.Drops = 0

	if newFactor != oldFactor {
		log.Printf("[Predictive] Campaign %s factor adjusted: %.2f → %.2f (drop_rate=%.2f%%, answer_rate=%.2f%%, samples=%d, target_drop=%.2f%%)",
			campaignID, oldFactor, newFactor, dropRate*100, answerRate*100, attempts, config.TargetDropRate*100)
	}

	return newFactor
}

func (d *DialerEngine) startPredictiveStatsLoop() {
	intervalMs := DefaultAdaptIntervalMs
	dbConfig, err := d.getGlobalPredictiveConfig()
	if err == nil && dbConfig.AdaptIntervalMs > 0 {
		intervalMs = dbConfig.AdaptIntervalMs
	}

	ticker := time.NewTicker(time.Duration(intervalMs) * time.Millisecond)
	go func() {
		for {
			select {
			case <-ticker.C:
				d.collectAndAdaptPredictiveStats()
			case <-d.quitChan:
				ticker.Stop()
				return
			}
		}
	}()

	log.Printf("[Predictive] Stats loop started (interval=%dms)", intervalMs)
}

func (d *DialerEngine) collectAndAdaptPredictiveStats() {
	campaigns, err := d.getActiveCampaigns()
	if err != nil {
		return
	}

	for _, camp := range campaigns {
		if camp.CampaignType != "OUTBOUND_PREDICTIVE" {
			continue
		}

		cid := camp.CampaignID

		attemptsStr, _ := Redis.Get(ctx, "gescall:pstats:"+cid+":attempts").Result()
		answersStr, _ := Redis.Get(ctx, "gescall:pstats:"+cid+":answers").Result()
		dropsStr, _ := Redis.Get(ctx, "gescall:pstats:"+cid+":drops").Result()

		attempts, _ := strconv.Atoi(attemptsStr)
		answers, _ := strconv.Atoi(answersStr)
		drops, _ := strconv.Atoi(dropsStr)

		if attempts+answers+drops > 0 {
			Redis.Del(ctx,
				"gescall:pstats:"+cid+":attempts",
				"gescall:pstats:"+cid+":answers",
				"gescall:pstats:"+cid+":drops",
			)
		}

		d.predictive.UpdateStats(cid, attempts, answers, drops)

		config := d.getCampaignPredictiveConfig(camp)
		d.predictive.AdaptFactor(cid, config)
	}
}

func (d *DialerEngine) getCampaignPredictiveConfig(camp Campaign) PredictiveConfig {
	config := PredictiveConfig{
		TargetDropRate:   DefaultTargetDropRate,
		MinFactor:        DefaultMinFactor,
		MaxFactor:        DefaultMaxFactor,
		AdaptIntervalMs:  DefaultAdaptIntervalMs,
		SlidingWindowSec: DefaultSlidingWindowSec,
	}

	cid := camp.CampaignID

	rows, err := DB.Query(`
		SELECT 
			COALESCE(predictive_target_drop_rate, $2),
			COALESCE(predictive_min_factor, $3),
			COALESCE(predictive_max_factor, $4),
			COALESCE(predictive_adapt_interval_ms, $5),
			COALESCE(predictive_sliding_window_sec, $6)
		FROM gescall_campaigns 
		WHERE campaign_id = $1
	`, cid, DefaultTargetDropRate, DefaultMinFactor, DefaultMaxFactor, DefaultAdaptIntervalMs, DefaultSlidingWindowSec)

	if err != nil {
		return config
	}
	defer rows.Close()

	if rows.Next() {
		var targetDrop float64
		var minF, maxF float64
		var adaptMs, windowSec int
		if err := rows.Scan(&targetDrop, &minF, &maxF, &adaptMs, &windowSec); err == nil {
			config.TargetDropRate = targetDrop
			config.MinFactor = minF
			config.MaxFactor = maxF
			config.AdaptIntervalMs = adaptMs
			config.SlidingWindowSec = windowSec
		}
	}

	return config
}

func (d *DialerEngine) getGlobalPredictiveConfig() (PredictiveConfig, error) {
	config := PredictiveConfig{
		TargetDropRate:   DefaultTargetDropRate,
		MinFactor:        DefaultMinFactor,
		MaxFactor:        DefaultMaxFactor,
		AdaptIntervalMs:  DefaultAdaptIntervalMs,
		SlidingWindowSec: DefaultSlidingWindowSec,
	}

	return config, nil
}
