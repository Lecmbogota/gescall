package main

import (
	"encoding/json"
	"strconv"
	"strings"
	"time"
)

type dialScheduleJSON struct {
	Enabled  bool               `json:"enabled"`
	Timezone string             `json:"timezone"`
	Windows  []dialScheduleSlot `json:"windows"`
}

type dialScheduleSlot struct {
	Days  []int  `json:"days"`
	Start string `json:"start"`
	End   string `json:"end"`
}

func parseHHMM(s string) (h, m int, ok bool) {
	s = strings.TrimSpace(s)
	parts := strings.Split(s, ":")
	if len(parts) < 2 {
		return 0, 0, false
	}
	h, err1 := strconv.Atoi(parts[0])
	m, err2 := strconv.Atoi(strings.TrimSpace(parts[1]))
	if err1 != nil || err2 != nil || h < 0 || h > 23 || m < 0 || m > 59 {
		return 0, 0, false
	}
	return h, m, true
}

// campaignDialScheduleAllowed returns true if dialing is allowed for this instant.
// Nil/empty JSON, parse errors, or enabled=false → allow (sin restricción).
func campaignDialScheduleAllowed(raw []byte, now time.Time) bool {
	if len(raw) == 0 {
		return true
	}
	var ds dialScheduleJSON
	if err := json.Unmarshal(raw, &ds); err != nil {
		return true
	}
	if !ds.Enabled {
		return true
	}
	loc := time.UTC
	if ds.Timezone != "" {
		if l, err := time.LoadLocation(ds.Timezone); err == nil {
			loc = l
		}
	}
	t := now.In(loc)
	wd := int(t.Weekday())
	cur := t.Hour()*60 + t.Minute()

	// Sin ventanas: no bloquear (config incompleta / guardados parciales).
	if len(ds.Windows) == 0 {
		return true
	}

	for _, w := range ds.Windows {
		sh, sm, ok1 := parseHHMM(w.Start)
		eh, em, ok2 := parseHHMM(w.End)
		if !ok1 || !ok2 {
			continue
		}
		startMin := sh*60 + sm
		endMin := eh*60 + em

		dayMatch := false
		for _, d := range w.Days {
			if d == wd {
				dayMatch = true
				break
			}
		}
		if !dayMatch {
			continue
		}

		if startMin <= endMin {
			if cur >= startMin && cur <= endMin {
				return true
			}
		} else {
			// Ventana nocturna (ej. 22:00–06:00)
			if cur >= startMin || cur <= endMin {
				return true
			}
		}
	}
	return false
}
