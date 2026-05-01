package main

import (
	"database/sql"
	"fmt"
	"log"
)

// getDynamicCallerID translates the callerid_local_presence.agi logic into Go Native ARI
func (d *DialerEngine) getDynamicCallerID(targetPhone, campaignID, leadID string) string {
	// Extract area code
	areaCode := ""
	if len(targetPhone) >= 3 {
		if len(targetPhone) > 10 && targetPhone[:2] == "52" {
			areaCode = targetPhone[2:5]
		} else {
			areaCode = targetPhone[:3]
		}
	}

	if areaCode == "" {
		return ""
	}

	// 1. Get campaign settings
	var rotationMode, poolID, matchMode string
	var fixedAreaCode, fallbackCallerID sql.NullString
	var selectionStrategy string

	err := DB.QueryRow(`
		SELECT rotation_mode, pool_id, match_mode, fixed_area_code, 
               fallback_callerid, selection_strategy
        FROM gescall_campaign_callerid_settings 
        WHERE campaign_id = $1 AND rotation_mode = 'POOL'
	`, campaignID).Scan(&rotationMode, &poolID, &matchMode, &fixedAreaCode, &fallbackCallerID, &selectionStrategy)

	if err == sql.ErrNoRows {
		// 2. Default pool fallback
		err = DB.QueryRow(`
			SELECT p.id as pool_id, 'ROUND_ROBIN' as selection_strategy, 'LEAD' as match_mode
        	FROM gescall_callerid_pools p
        	JOIN gescall_callerid_pool_numbers n ON p.id = n.pool_id
        	WHERE p.is_active = true AND n.area_code = $1 AND n.is_active = true
        	LIMIT 1
		`, areaCode).Scan(&poolID, &selectionStrategy, &matchMode)
	}

	if err != nil {
		if fallbackCallerID.Valid && fallbackCallerID.String != "" {
			return fallbackCallerID.String
		}
		return ""
	}

	targetAreaCode := areaCode
	if matchMode == "FIXED" && fixedAreaCode.Valid && fixedAreaCode.String != "" {
		targetAreaCode = fixedAreaCode.String
	}

	// 3. Select CallerID
	var callerID string
	var numberID int
	
	query := "SELECT id, callerid FROM gescall_callerid_pool_numbers WHERE pool_id = $1 AND area_code = $2 AND is_active = true "
	if selectionStrategy == "RANDOM" {
		query += "ORDER BY RANDOM() LIMIT 1"
	} else if selectionStrategy == "LRU" {
		query += "ORDER BY last_used_at ASC NULLS FIRST, id ASC LIMIT 1"
	} else {
		// ROUND_ROBIN
		query += "ORDER BY rr_order ASC, id ASC LIMIT 1"
	}

	err = DB.QueryRow(query, poolID, targetAreaCode).Scan(&numberID, &callerID)
	if err != nil {
		log.Printf("[DynamicCID] No active numbers for pool %s area %s", poolID, targetAreaCode)
		if fallbackCallerID.Valid && fallbackCallerID.String != "" {
			return fallbackCallerID.String
		}
		return ""
	}

	// 4. Update Usage Stats
	if selectionStrategy == "ROUND_ROBIN" {
		var newOrder int
		DB.QueryRow("SELECT COALESCE(MAX(rr_order),0)+1 FROM gescall_callerid_pool_numbers WHERE pool_id = $1 AND area_code = $2", poolID, targetAreaCode).Scan(&newOrder)
		DB.Exec("UPDATE gescall_callerid_pool_numbers SET rr_order = $1, last_used_at = NOW(), use_count = use_count + 1 WHERE id = $2", newOrder, numberID)
	} else {
		DB.Exec("UPDATE gescall_callerid_pool_numbers SET last_used_at = NOW(), use_count = use_count + 1 WHERE id = $1", numberID)
	}

	// 5. Log Usage
	leadIDInt := 0
	fmt.Sscanf(leadID, "%d", &leadIDInt) // Safely convert to int if possible or let PG handle
	
	DB.Exec(`INSERT INTO gescall_callerid_usage_log 
		(campaign_id, lead_id, phone_number, callerid_used, area_code_target, pool_id, selection_result, strategy) 
		VALUES ($1, $2, $3, $4, $5, $6, 'MATCHED', $7)`, 
		campaignID, leadID, targetPhone, callerID, targetAreaCode, poolID, selectionStrategy)

	log.Printf("[DynamicCID] Assigned %s for lead %s (Area: %s, Strategy: %s)", callerID, leadID, targetAreaCode, selectionStrategy)
	return callerID
}
