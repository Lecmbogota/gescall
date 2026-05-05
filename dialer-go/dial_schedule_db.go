package main

import (
	"log"
	"sync"

	"github.com/lib/pq"
)

var (
	dialSchedColMu     sync.Mutex
	dialSchedColKnown bool
	dialSchedColOK     bool
)

// dialScheduleColumnExists comprueba si existe dial_schedule (migración 022 opcional).
func dialScheduleColumnExists() bool {
	dialSchedColMu.Lock()
	defer dialSchedColMu.Unlock()
	if dialSchedColKnown {
		return dialSchedColOK
	}
	dialSchedColKnown = true
	var n int
	err := DB.QueryRow(`
		SELECT COUNT(*) FROM information_schema.columns
		WHERE table_schema = 'public'
		  AND table_name = 'gescall_campaigns'
		  AND column_name = 'dial_schedule'
	`).Scan(&n)
	if err != nil {
		log.Printf("[RedisDialer] No se pudo comprobar columna dial_schedule: %v", err)
		dialSchedColOK = false
		return false
	}
	dialSchedColOK = n > 0
	return dialSchedColOK
}

// attachDialSchedules rellena DialScheduleJSON sin romper getActiveCampaigns si la columna no existe.
func attachDialSchedules(campaigns []Campaign) {
	if len(campaigns) == 0 || !dialScheduleColumnExists() {
		return
	}
	ids := make([]string, len(campaigns))
	for i := range campaigns {
		ids[i] = campaigns[i].CampaignID
	}
	rows, err := DB.Query(
		`SELECT campaign_id, dial_schedule FROM gescall_campaigns WHERE campaign_id = ANY($1)`,
		pq.Array(ids),
	)
	if err != nil {
		log.Printf("[RedisDialer] Carga opcional de dial_schedule falló: %v", err)
		return
	}
	defer rows.Close()

	byID := make(map[string][]byte)
	for rows.Next() {
		var id string
		var raw []byte
		if err := rows.Scan(&id, &raw); err != nil {
			continue
		}
		if len(raw) > 0 {
			byID[id] = raw
		}
	}
	for i := range campaigns {
		if b, ok := byID[campaigns[i].CampaignID]; ok {
			campaigns[i].DialScheduleJSON = b
		}
	}
}
