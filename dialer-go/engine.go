package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

type Campaign struct {
	CampaignID      string
	DialPrefix      string
	DialMethod      string
	CallerID        string
	AutoDialLevel   float64
	AltPhoneEnabled bool
	CampaignType    string
	// dial_schedule JSONB: si enabled y fuera de ventanas, no se disca
	DialScheduleJSON []byte
	// Per-campaign trunk overrides (from gescall_trunks via trunk_id)
	TrunkEndpoint string // trunk_id used as PJSIP endpoint name
	TrunkHost     string
	TrunkPort     string
	TrunkPrefix   string
	// Predictive dialing config
	PredictiveTargetDropRate  float64
	PredictiveMinFactor       float64
	PredictiveMaxFactor       float64
	PredictiveAdaptIntervalMs int
}

type DialerEngine struct {
	isRunning       bool
	isTicking       bool
	checkIntervalMs int
	maxConcurrent   int
	maxCps          int

	sbcEndpoint string
	sbcHost     string
	sbcPort     string
	sbcPrefix   string

	ticker          *time.Ticker
	hopperTicker    *time.Ticker
	healthTicker    *time.Ticker
	quitChan        chan struct{}
	mu              sync.Mutex

	ariClient *ARIClient

	// Circuit breaker for ARI connectivity
	ariDown          bool
	ariFailCount     int
	ariFailThreshold int // consecutive failures before tripping

	// Predictive dialing engine
	predictive      *PredictiveState
	predictiveConfig *PredictiveConfig
}

func NewDialerEngine() *DialerEngine {
	intervalMs, _ := strconv.Atoi(os.Getenv("DIALER_INTERVAL_MS"))
	if intervalMs == 0 {
		intervalMs = 1000
	}
	maxConcurrent, _ := strconv.Atoi(os.Getenv("DIALER_MAX_CONCURRENT"))
	if maxConcurrent == 0 {
		maxConcurrent = 100
	}
	maxCps, _ := strconv.Atoi(os.Getenv("DIALER_MAX_CPS"))
	if maxCps == 0 {
		maxCps = 15 // Lowered safe default for SIP UDP
	}

	endpoint := strings.TrimSpace(os.Getenv("SBC_ENDPOINT"))
	// Sin placeholder: SBC_* en .env o enrichSBCDefaultsFromDB() en main.go.
	host := os.Getenv("SBC_HOST")
	port := os.Getenv("SBC_PORT")
	if port == "" {
		port = "5060"
	}
	prefix := os.Getenv("SBC_PREFIX")
	// Default is empty — per-trunk dial_prefix should be configured in DB when needed.

	log.Printf("[RedisDialer] Initialized. Interval: %dms, Max Concurrent: %d, Max CPS: %d\n", intervalMs, maxConcurrent, maxCps)

	return &DialerEngine{
		checkIntervalMs:  intervalMs,
		maxConcurrent:    maxConcurrent,
		maxCps:           maxCps,
		sbcEndpoint:      endpoint,
		sbcHost:          host,
		sbcPort:          port,
		sbcPrefix:        prefix,
		quitChan:         make(chan struct{}),
		ariClient:        NewARIClient(),
		ariFailThreshold: 3,
		predictive:       NewPredictiveState(),
	}
}

func (d *DialerEngine) Start() {
	d.mu.Lock()
	if d.isRunning {
		d.mu.Unlock()
		return
	}
	d.isRunning = true
	d.mu.Unlock()

	log.Println("[RedisDialer] Starting Core Engine Loop...")

	d.ticker = time.NewTicker(time.Duration(d.checkIntervalMs) * time.Millisecond)
	d.healthTicker = time.NewTicker(60 * time.Second)

	go d.loop()
	d.startPredictiveStatsLoop()
}

func (d *DialerEngine) Stop() {
	d.mu.Lock()
	if !d.isRunning {
		d.mu.Unlock()
		return
	}
	d.isRunning = false
	d.mu.Unlock()

	if d.ticker != nil {
		d.ticker.Stop()
	}
	if d.healthTicker != nil {
		d.healthTicker.Stop()
	}
	close(d.quitChan)
	log.Println("[RedisDialer] Stopped.")
}

func (d *DialerEngine) loop() {
	for {
		select {
		case <-d.ticker.C:
			d.tick()
		case <-d.healthTicker.C:
			// Simple health check output
			keys, _ := Redis.Keys(ctx, "gescall:call:*").Result()
			log.Printf("[HealthCheck] Active calls keys: %d", len(keys))
		case <-d.quitChan:
			return
		}
	}
}

// checkARIHealth pings the ARI server to see if it's reachable
func (d *DialerEngine) checkARIHealth() bool {
	_, err := d.ariClient.Ping()
	return err == nil
}

// recordARIFailure increments the failure counter and trips the circuit if threshold is reached
func (d *DialerEngine) recordARIFailure() {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.ariFailCount++
	if !d.ariDown && d.ariFailCount >= d.ariFailThreshold {
		d.ariDown = true
		log.Printf("[CircuitBreaker] ARI is DOWN after %d consecutive failures — PAUSING dialer to protect leads", d.ariFailCount)
	}
}

// recordARISuccess resets the failure counter and re-enables the circuit
func (d *DialerEngine) recordARISuccess() {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.ariDown {
		log.Printf("[CircuitBreaker] ARI is BACK UP — resuming dialer")
	}
	d.ariDown = false
	d.ariFailCount = 0
}

func (d *DialerEngine) tick() {
	d.mu.Lock()
	if !d.isRunning || d.isTicking {
		d.mu.Unlock()
		return
	}
	d.isTicking = true
	ariDown := d.ariDown
	d.mu.Unlock()

	defer func() {
		d.mu.Lock()
		d.isTicking = false
		d.mu.Unlock()
	}()

	// Circuit breaker: if ARI is down, check health and skip dialing
	if ariDown {
		if d.checkARIHealth() {
			d.recordARISuccess()
		} else {
			// Still down — don't pop any leads
			return
		}
	}

	// Real-time calculation of global max CPS from trunks
	var dbMaxCps sql.NullInt64
	err := DB.QueryRow("SELECT SUM(max_cps) FROM gescall_trunks WHERE active = true").Scan(&dbMaxCps)
	if err == nil && dbMaxCps.Valid {
		d.maxCps = int(dbMaxCps.Int64)
	}
	if d.maxCps <= 0 {
		d.maxCps = 15 // Fallback safe default
	}

	campaigns, err := d.getActiveCampaigns()
	if err != nil {
		log.Printf("[RedisDialer] Error fetching campaigns: %v", err)
		return
	}
	if len(campaigns) == 0 {
		log.Printf("[RedisDialer] No active campaigns found. Skipping tick.")
		return
	}

	// Predictive/progressive need agent-aware pacing; process them before BLASTER so
	// global CPS budget is not exhausted every tick by high-rate campaigns (starvation).
	sort.SliceStable(campaigns, func(i, j int) bool {
		return dialPriority(campaigns[i].CampaignType) < dialPriority(campaigns[j].CampaignType)
	})

	totalLaunchedThisTick := 0

	for _, camp := range campaigns {
		// Remaining CPS budget for this tick — skip heavy work when already exhausted.
		if totalLaunchedThisTick >= d.maxCps {
			continue
		}

		if !campaignDialScheduleAllowed(camp.DialScheduleJSON, time.Now()) {
			continue
		}

		// Re-check circuit breaker mid-tick
		d.mu.Lock()
		if d.ariDown {
			d.mu.Unlock()
			break
		}
		d.mu.Unlock()

		activeCount, _ := d.getActiveCount(camp.CampaignID)
		
		maxToPopThisCamp := 0

		if camp.CampaignType == "BLASTER" || camp.CampaignType == "" {
			// Blaster pacing (pure CPS based on auto_dial_level as limit)
			campaignCps := int(camp.AutoDialLevel)
			if campaignCps <= 0 {
				campaignCps = 1
			}
			maxToPopThisCamp = campaignCps

			if d.checkIntervalMs < 1000 {
				maxToPopThisCamp = int(float64(campaignCps) * (float64(d.checkIntervalMs) / 1000.0))
				if maxToPopThisCamp < 1 && campaignCps > 0 {
					maxToPopThisCamp = 1
				}
			}
		} else if camp.CampaignType == "OUTBOUND_PREDICTIVE" || camp.CampaignType == "OUTBOUND_PROGRESSIVE" {
			agentKeys, err := Redis.Keys(ctx, "gescall:agent:*").Result()
			readyCount := 0
			if err == nil {
				campID := strings.TrimSpace(camp.CampaignID)
				for _, ak := range agentKeys {
					stateMap, _ := Redis.HGetAll(ctx, ak).Result()
					if strings.TrimSpace(stateMap["state"]) != "READY" {
						continue
					}
					campaignIDs := strings.TrimSpace(stateMap["campaign_ids"])
					if campaignIDs == "" {
						campaignIDs = strings.TrimSpace(stateMap["campaign_id"])
					}
					if campID != "" && strings.Contains(","+campaignIDs+",", ","+campID+",") {
						readyCount++
					}
				}
			}

			if readyCount > 0 {
				if camp.CampaignType == "OUTBOUND_PREDICTIVE" {
					config := d.getCampaignPredictiveConfig(camp)
					factor := d.predictive.GetFactor(camp.CampaignID, config)
					if factor <= 0 {
						factor = 1.0
					}
					// Ceil evita int(0) cuando factor*readyCount < 1 (p. ej. factor bajo por config).
					targetConcurrent := int(math.Ceil(float64(readyCount) * factor))
					if targetConcurrent < 1 {
						targetConcurrent = 1
					}
					neededCalls := targetConcurrent - activeCount
					if neededCalls > 0 {
						maxToPopThisCamp = neededCalls
					}
				} else {
					multiplier := camp.AutoDialLevel
					if multiplier <= 0 {
						multiplier = 1.0
					}
					targetConcurrent := int(math.Ceil(float64(readyCount) * multiplier))
					if targetConcurrent < 1 {
						targetConcurrent = 1
					}
					neededCalls := targetConcurrent - activeCount
					if neededCalls > 0 {
						maxToPopThisCamp = neededCalls
					}
				}
			}

			if maxToPopThisCamp > d.maxCps {
				maxToPopThisCamp = d.maxCps
			}
		}

		// Also respect global Max CPS remaining
		globalRemainingCps := d.maxCps - totalLaunchedThisTick
		if maxToPopThisCamp > globalRemainingCps {
			maxToPopThisCamp = globalRemainingCps
		}

		availableSlots := d.maxConcurrent - activeCount
		if availableSlots > maxToPopThisCamp {
			availableSlots = maxToPopThisCamp
		}

		if availableSlots <= 0 {
			continue
		}

		listKey := fmt.Sprintf("gescall:hopper:%s", camp.CampaignID)
		leadsStr, err := Redis.LPopCount(ctx, listKey, availableSlots).Result()
		
		if err != nil && err != redis.Nil {
			log.Printf("[RedisDialer] Error popping hopper %s: %v", listKey, err)
			continue
		}

		if len(leadsStr) == 0 {
			continue
		}

		totalLaunchedThisTick += len(leadsStr)
		log.Printf("[RedisDialer] Launching %d calls for %s (availableSlots=%d, popped=%d)", len(leadsStr), camp.CampaignID, availableSlots, len(leadsStr))

		// Launch all popped leads
		go func(leads []string, c Campaign) {
			for i, leadStr := range leads {
				go d.launchCall(leadStr, c)
				// Small hardcoded padding to prevent UDP bursts (50 cps = 20ms)
				if i < len(leads)-1 {
					time.Sleep(20 * time.Millisecond)
				}
			}
		}(leadsStr, camp)
	}
}

func (d *DialerEngine) getActiveCampaigns() ([]Campaign, error) {
	rows, err := DB.Query(`
		SELECT 
			c.campaign_id, c.dial_prefix, c.dial_method, c.campaign_cid, 
			c.auto_dial_level, c.alt_phone_enabled, c.campaign_type,
			t.trunk_id, t.provider_host, t.provider_port, t.dial_prefix AS trunk_dial_prefix,
			COALESCE(c.predictive_target_drop_rate, 0.03),
			COALESCE(c.predictive_min_factor, 1.0),
			COALESCE(c.predictive_max_factor, 4.0),
			COALESCE(c.predictive_adapt_interval_ms, 10000)
		FROM gescall_campaigns c
		LEFT JOIN gescall_trunks t ON c.trunk_id = t.trunk_id
		WHERE c.active = true 
		  AND c.campaign_type IN ('BLASTER', 'OUTBOUND_PREDICTIVE', 'OUTBOUND_PROGRESSIVE')
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var campaigns []Campaign
	for rows.Next() {
		var c Campaign
		var prefix, cid, ctype sql.NullString
		var autoDial sql.NullFloat64
		var altPhone sql.NullBool
		var trunkID, trunkHost, trunkDialPrefix sql.NullString
		var trunkPort sql.NullInt64
		var predTargetDrop sql.NullFloat64
		var predMinFactor sql.NullFloat64
		var predMaxFactor sql.NullFloat64
		var predAdaptMs sql.NullInt64
		if err := rows.Scan(&c.CampaignID, &prefix, &c.DialMethod, &cid, &autoDial, &altPhone, &ctype, &trunkID, &trunkHost, &trunkPort, &trunkDialPrefix, &predTargetDrop, &predMinFactor, &predMaxFactor, &predAdaptMs); err == nil {
			if prefix.Valid {
				c.DialPrefix = prefix.String
			}
			if cid.Valid {
				c.CallerID = cid.String
			}
			if autoDial.Valid {
				c.AutoDialLevel = autoDial.Float64
			} else {
				c.AutoDialLevel = 1.0
			}
			if altPhone.Valid {
				c.AltPhoneEnabled = altPhone.Bool
			} else {
				c.AltPhoneEnabled = false
			}
			if ctype.Valid {
				c.CampaignType = ctype.String
			} else {
				c.CampaignType = "BLASTER"
			}
			if predTargetDrop.Valid {
				c.PredictiveTargetDropRate = predTargetDrop.Float64
			} else {
				c.PredictiveTargetDropRate = 0.03
			}
			if predMinFactor.Valid {
				c.PredictiveMinFactor = predMinFactor.Float64
			} else {
				c.PredictiveMinFactor = 1.0
			}
			if predMaxFactor.Valid {
				c.PredictiveMaxFactor = predMaxFactor.Float64
			} else {
				c.PredictiveMaxFactor = 4.0
			}
			if predAdaptMs.Valid {
				c.PredictiveAdaptIntervalMs = int(predAdaptMs.Int64)
			} else {
				c.PredictiveAdaptIntervalMs = 10000
			}
			// Per-campaign trunk (fallback to global env if not set)
			if trunkID.Valid && trunkID.String != "" {
				c.TrunkEndpoint = trunkID.String
				c.TrunkHost = trunkHost.String
				if trunkPort.Valid {
					c.TrunkPort = fmt.Sprintf("%d", trunkPort.Int64)
				} else {
					c.TrunkPort = "5060"
				}
				if trunkDialPrefix.Valid {
					c.TrunkPrefix = trunkDialPrefix.String
				}
			}
			campaigns = append(campaigns, c)
		} else {
			log.Printf("[RedisDialer] Error scanning campaign: %v", err)
		}
	}
	attachDialSchedules(campaigns)
	return campaigns, nil
}

// getActiveCount cuenta llamadas que aún ocupan “capacidad” para pacing predictivo.
// Node puede escribir ari_handled=YES / final_status en Redis antes de borrar la clave
// (logCallResult vs ChannelDestroyed); esas claves no deben bloquear nuevos intentos.
func (d *DialerEngine) getActiveCount(campaignID string) (int, error) {
	keys, err := Redis.Keys(ctx, fmt.Sprintf("gescall:call:%s:*", campaignID)).Result()
	if err != nil {
		return 0, err
	}
	if len(keys) == 0 {
		return 0, nil
	}
	pipe := Redis.Pipeline()
	ariCmds := make([]*redis.StringCmd, len(keys))
	fsCmds := make([]*redis.StringCmd, len(keys))
	for i, k := range keys {
		ariCmds[i] = pipe.HGet(ctx, k, "ari_handled")
		fsCmds[i] = pipe.HGet(ctx, k, "final_status")
	}
	if _, err := pipe.Exec(ctx); err != nil {
		return len(keys), err
	}
	n := 0
	for i := range keys {
		ah, _ := ariCmds[i].Result()
		if ah == "YES" {
			continue
		}
		fs, _ := fsCmds[i].Result()
		if strings.TrimSpace(fs) != "" {
			continue
		}
		n++
	}
	return n, nil
}

// dialPriority: lower = earlier in each tick so predictive/progressive are not starved
// when BLASTER campaigns consume the full global CPS budget first.
func dialPriority(campaignType string) int {
	switch campaignType {
	case "OUTBOUND_PREDICTIVE":
		return 0
	case "OUTBOUND_PROGRESSIVE":
		return 1
	case "BLASTER", "":
		return 2
	default:
		return 3
	}
}

// requeueHopperLead restores a popped entry after LPop when we cannot claim or parse it.
func requeueHopperLead(campaignID, leadJSON string) {
	key := fmt.Sprintf("gescall:hopper:%s", campaignID)
	if err := Redis.RPush(ctx, key, leadJSON).Err(); err != nil {
		log.Printf("[RedisDialer] requeue hopper %s failed: %v", key, err)
	}
}

func (d *DialerEngine) launchCall(leadJSON string, camp Campaign) {
	var lead map[string]interface{}
	if err := json.Unmarshal([]byte(leadJSON), &lead); err != nil {
		log.Printf("[RedisDialer] Parse error: %v — requeueing hopper entry", err)
		requeueHopperLead(camp.CampaignID, leadJSON)
		return
	}

	leadID := fmt.Sprintf("%v", lead["lead_id"])
	phoneNumber := fmt.Sprintf("%v", lead["phone_number"])
	listID := "999"
	if val, ok := lead["list_id"]; ok {
		listID = fmt.Sprintf("%v", val)
	}

	phoneIndex := 0
	if val, ok := lead["phone_index"]; ok {
		if pi, err := strconv.Atoi(fmt.Sprintf("%v", val)); err == nil {
			phoneIndex = pi
		} else if f, ok := val.(float64); ok {
			phoneIndex = int(f)
		}
	}

	altPhones := []string{}
	if val, ok := lead["alt_phones"].([]interface{}); ok {
		for _, v := range val {
			altPhones = append(altPhones, fmt.Sprintf("%v", v))
		}
	}

	targetPhone := phoneNumber
	altPhoneStr := "NO"
	if camp.AltPhoneEnabled {
		if phoneIndex > 0 && len(altPhones) >= phoneIndex {
			targetPhone = altPhones[phoneIndex-1]
			altPhoneStr = "YES"
		}
	}

	// Atomically claim lead — prevents duplicates from hopper refill race
	result, err := DB.Exec(
		"UPDATE gescall_leads SET status = 'DIALING', last_call_time = NOW(), phone_index = $1 WHERE lead_id = $2 AND status IN ('NEW', 'QUEUE')",
		phoneIndex, leadID,
	)
	if err != nil {
		log.Printf("[RedisDialer] DB claim error lead=%s: %v — requeueing hopper entry", leadID, err)
		requeueHopperLead(camp.CampaignID, leadJSON)
		return
	}
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		var st sql.NullString
		if err := DB.QueryRow("SELECT status FROM gescall_leads WHERE lead_id = $1", leadID).Scan(&st); err != nil {
			log.Printf("[RedisDialer] claim skip lead=%s: %v", leadID, err)
			return
		}
		if !st.Valid || (st.String != "NEW" && st.String != "QUEUE") {
			log.Printf("[RedisDialer] claim skip lead=%s: terminal status %s (dropped from hopper)", leadID, st.String)
			return
		}
		log.Printf("[RedisDialer] DB claim race lead=%s; requeueing hopper entry", leadID)
		requeueHopperLead(camp.CampaignID, leadJSON)
		return
	}

	// Target URI - use per-campaign trunk if set, otherwise global defaults
	fullNumber := camp.DialPrefix + targetPhone
	if camp.TrunkEndpoint == "" && (strings.TrimSpace(d.sbcEndpoint) == "" || strings.TrimSpace(d.sbcHost) == "") {
		log.Printf("[ARI Originate Skipped] lead=%s: sin trunk en campaña ni SBC_ENDPOINT+SBC_HOST (troncal activo en BD o .env)", leadID)
		DB.Exec("UPDATE gescall_leads SET status = 'NEW', last_call_time = NULL WHERE lead_id = $1", leadID)
		return
	}
	// Formato recomendado PJSIP: PJSIP/<número>@<endpoint> (outbound_auth / AOR del troncal).
	// El estilo PJSIP/endpoint/sip:user@host falla en algunos despliegues con "Allocation failed".
	var endpointURI string
	if camp.TrunkEndpoint != "" {
		dialDigits := camp.TrunkPrefix + fullNumber
		if dialDigits == "" {
			dialDigits = fullNumber
		}
		endpointURI = fmt.Sprintf("PJSIP/%s@%s", dialDigits, camp.TrunkEndpoint)
	} else {
		dialDigits := d.sbcPrefix + fullNumber
		if dialDigits == "" {
			dialDigits = fullNumber
		}
		endpointURI = fmt.Sprintf("PJSIP/%s@%s", dialDigits, d.sbcEndpoint)
	}

	// Get Dynamic CallerID
	dynamicCid := d.getDynamicCallerID(targetPhone, camp.CampaignID, leadID)
	finalCid := camp.CallerID
	if dynamicCid != "" {
		finalCid = dynamicCid
	}

	// CallerID syntax
	formattedCid := fmt.Sprintf("\"%s\" <%s>", finalCid, finalCid)

	// Make the ARI channel request
	channelID, err := d.ariClient.Originate(OriginateRequest{
		Endpoint: endpointURI,
		App:      "gescall-ivr",
		AppArgs:  "outbound", // Explicit app arg to identify outbound
		CallerId: formattedCid,
		Timeout:  35, // typical ring timeout
		Variables: map[string]string{
			"leadid": leadID,
			"campaign_id": camp.CampaignID,
			"campaign_type": camp.CampaignType,
			"phone_number": targetPhone,
			"__GESCALL_CID": finalCid,
			"GESCALL_NATIVE": "YES", // Explicit flag for PG DB flows
			"phone_index": strconv.Itoa(phoneIndex),
			"alt_phone_enabled": strconv.FormatBool(camp.AltPhoneEnabled),
			"is_alt_phone": altPhoneStr,
			"trunk_id": camp.TrunkEndpoint,
		},
	})

	if err != nil {
		log.Printf("[ARI Originate Failed] lead=%s: %v", leadID, err)
		// Revert lead to NEW so it goes back into the hopper for retry
		DB.Exec("UPDATE gescall_leads SET status = 'NEW', last_call_time = NULL WHERE lead_id = $1", leadID)
		// Record failure for circuit breaker
		d.recordARIFailure()
		return
	}

	// Successful ARI originate — reset circuit breaker
	d.recordARISuccess()

	callKey := fmt.Sprintf("gescall:call:%s:%s", camp.CampaignID, channelID)
	
	// Create Redis Key
	Redis.HSet(ctx, callKey, map[string]interface{}{
		"lead_id": leadID,
		"list_id": listID,
		"campaign_id": camp.CampaignID,
		"phone_number": targetPhone,
		"status": "DIALING",
		"start_time": time.Now().UnixMilli(),
		"channel_id": channelID,
		"phone_index": phoneIndex,
		"alt_phone_enabled": camp.AltPhoneEnabled,
		"trunk_id": camp.TrunkEndpoint,
	})
	Redis.Expire(ctx, callKey, 180*time.Second)

	// Create PG Log
	DB.Exec(`INSERT INTO gescall_call_log 
			(lead_id, phone_number, campaign_id, list_id, call_date, call_status, call_duration, dtmf_pressed, trunk_id) 
			VALUES ($1, $2, $3, $4, NOW(), 'DIALING', 0, '0', $5)`,
		leadID, targetPhone, camp.CampaignID, listID, camp.TrunkEndpoint)
}
