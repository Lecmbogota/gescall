package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strconv"
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

	endpoint := os.Getenv("SBC_ENDPOINT")
	if endpoint == "" {
		endpoint = "sbc233"
	}
	host := os.Getenv("SBC_HOST")
	port := os.Getenv("SBC_PORT")
	if port == "" {
		port = "5060"
	}
	prefix := os.Getenv("SBC_PREFIX")
	if prefix == "" {
		prefix = "1122"
	}

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

	totalLaunchedThisTick := 0

	for _, camp := range campaigns {
		// Ensure we don't exceed global Max CPS
		if totalLaunchedThisTick >= d.maxCps {
			break
		}

		// Re-check circuit breaker mid-tick
		d.mu.Lock()
		if d.ariDown {
			d.mu.Unlock()
			break
		}
		d.mu.Unlock()

		activeCount, _ := d.getActiveCount(camp.CampaignID)
		
		// Campaign's specific CPS limit from auto_dial_level
		campaignCps := int(camp.AutoDialLevel)
		if campaignCps <= 0 {
			campaignCps = 1 // Prevent total freeze if accidentally set to <= 0
		}
		
		maxToPopThisCamp := campaignCps

		if d.checkIntervalMs < 1000 {
			maxToPopThisCamp = int(float64(campaignCps) * (float64(d.checkIntervalMs) / 1000.0))
			if maxToPopThisCamp < 1 && campaignCps > 0 {
				maxToPopThisCamp = 1 // ensure at least 1 pop if we are ticking fast
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
	rows, err := DB.Query("SELECT campaign_id, dial_prefix, dial_method, campaign_cid, auto_dial_level, alt_phone_enabled FROM gescall_campaigns WHERE active = true AND dial_method = 'RATIO'")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var campaigns []Campaign
	for rows.Next() {
		var c Campaign
		var prefix, cid sql.NullString
		var autoDial sql.NullFloat64
		var altPhone sql.NullBool
		if err := rows.Scan(&c.CampaignID, &prefix, &c.DialMethod, &cid, &autoDial, &altPhone); err == nil {
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
			campaigns = append(campaigns, c)
		} else {
			log.Printf("[RedisDialer] Error scanning campaign: %v", err)
		}
	}
	return campaigns, nil
}

func (d *DialerEngine) getActiveCount(campaignID string) (int, error) {
	keys, err := Redis.Keys(ctx, fmt.Sprintf("gescall:call:%s:*", campaignID)).Result()
	if err != nil {
		return 0, err
	}
	return len(keys), nil
}

func (d *DialerEngine) launchCall(leadJSON string, camp Campaign) {
	var lead map[string]interface{}
	if err := json.Unmarshal([]byte(leadJSON), &lead); err != nil {
		log.Printf("[RedisDialer] Parse error: %v", err)
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
		log.Printf("[RedisDialer] DB claim error lead=%s: %v", leadID, err)
		return
	}
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		// Already dialing/completed/DNC — skip
		return
	}

	// Target URI
	fullNumber := camp.DialPrefix + targetPhone
	endpointURI := fmt.Sprintf("PJSIP/%s/sip:%s%s@%s:%s", d.sbcEndpoint, d.sbcPrefix, fullNumber, d.sbcHost, d.sbcPort)

	// CallerID syntax
	formattedCid := fmt.Sprintf("\"%s\" <%s>", camp.CallerID, camp.CallerID)

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
			"phone_number": targetPhone,
			"__GESCALL_CID": camp.CallerID,
			"GESCALL_NATIVE": "YES", // Explicit flag for PG DB flows
			"phone_index": strconv.Itoa(phoneIndex),
			"alt_phone_enabled": strconv.FormatBool(camp.AltPhoneEnabled),
			"is_alt_phone": altPhoneStr,
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
	})
	Redis.Expire(ctx, callKey, 180*time.Second)

	// Create PG Log
	DB.Exec(`INSERT INTO gescall_call_log 
			(lead_id, phone_number, campaign_id, list_id, call_date, call_status, call_duration, dtmf_pressed) 
			VALUES ($1, $2, $3, $4, NOW(), 'DIALING', 0, '0')`,
		leadID, targetPhone, camp.CampaignID, listID)
}
