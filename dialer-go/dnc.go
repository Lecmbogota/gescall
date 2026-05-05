package main

import (
	"database/sql"
	"log"
	"strings"
	"unicode"
)

// digitsOnly strips non-digits for comparison with gescall_dnc.phone_number (same as Node DNC routes).
func digitsOnly(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// phoneBlockedByDNC is a second line of defense after hopper load: global or per-campaign blacklist.
func phoneBlockedByDNC(db *sql.DB, rawPhone, campaignID string) bool {
	clean := digitsOnly(rawPhone)
	if clean == "" {
		return false
	}
	var blocked bool
	err := db.QueryRow(`
		SELECT EXISTS (
			SELECT 1 FROM gescall_dnc d
			WHERE d.phone_number = $1
			  AND (d.campaign_id IS NULL OR d.campaign_id = $2)
		)`, clean, campaignID).Scan(&blocked)
	if err != nil {
		log.Printf("[DNC] check failed: %v — allowing dial", err)
		return false
	}
	return blocked
}
