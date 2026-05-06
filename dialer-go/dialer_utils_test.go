package main

import (
	"encoding/json"
	"testing"
	"time"
)

func TestDigitsOnly(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"+57 300-123-4567", "573001234567"},
		{"3001234567", "3001234567"},
		{"abc", ""},
		{"(555) 123-4567", "5551234567"},
		{"", ""},
		{"1-800-FLOWERS", "1800"},
	}

	for _, tt := range tests {
		got := digitsOnly(tt.input)
		if got != tt.expected {
			t.Errorf("digitsOnly(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}

func TestParseHHMM(t *testing.T) {
	tests := []struct {
		input   string
		wantH   int
		wantM   int
		wantOK  bool
	}{
		{"09:30", 9, 30, true},
		{" 08:00 ", 8, 0, true},
		{"00:00", 0, 0, true},
		{"23:59", 23, 59, true},
		{"abc", 0, 0, false},
		{"24:00", 0, 0, false},
		{"12:60", 0, 0, false},
		{"12", 0, 0, false},
		{"-1:00", 0, 0, false},
	}

	for _, tt := range tests {
		h, m, ok := parseHHMM(tt.input)
		if ok != tt.wantOK {
			t.Errorf("parseHHMM(%q) ok = %v, want %v", tt.input, ok, tt.wantOK)
			continue
		}
		if ok && (h != tt.wantH || m != tt.wantM) {
			t.Errorf("parseHHMM(%q) = (%d,%d), want (%d,%d)", tt.input, h, m, tt.wantH, tt.wantM)
		}
	}
}

func TestCampaignDialScheduleAllowed(t *testing.T) {
	// Helper to create JSON
	makeConfig := func(enabled bool, tz string, windows []dialScheduleSlot) []byte {
		ds := dialScheduleJSON{Enabled: enabled, Timezone: tz, Windows: windows}
		b, _ := json.Marshal(ds)
		return b
	}

	// 2026-05-06 is a Wednesday (weekday 3 in Go, but time.Weekday: Sunday=0...Saturday=6)
	// May 6 2026 = Wednesday = 3

	t.Run("null json allows", func(t *testing.T) {
		if !campaignDialScheduleAllowed(nil, time.Now()) {
			t.Error("nil should allow")
		}
	})

	t.Run("empty json allows", func(t *testing.T) {
		if !campaignDialScheduleAllowed([]byte{}, time.Now()) {
			t.Error("empty should allow")
		}
	})

	t.Run("disabled allows", func(t *testing.T) {
		cfg := makeConfig(false, "UTC", nil)
		if !campaignDialScheduleAllowed(cfg, time.Now()) {
			t.Error("disabled should allow")
		}
	})

	t.Run("within window allows", func(t *testing.T) {
		now := time.Date(2026, 5, 6, 14, 0, 0, 0, time.UTC)
		cfg := makeConfig(true, "UTC", []dialScheduleSlot{
			{Days: []int{0, 1, 2, 3, 4, 5, 6}, Start: "08:00", End: "18:00"},
		})
		if !campaignDialScheduleAllowed(cfg, now) {
			t.Error("should allow at 14:00 within 08:00-18:00")
		}
	})

	t.Run("outside window blocks", func(t *testing.T) {
		now := time.Date(2026, 5, 6, 3, 0, 0, 0, time.UTC)
		cfg := makeConfig(true, "UTC", []dialScheduleSlot{
			{Days: []int{3}, Start: "08:00", End: "18:00"},
		})
		if campaignDialScheduleAllowed(cfg, now) {
			t.Error("should block at 03:00 outside 08:00-18:00")
		}
	})

	t.Run("overnight window", func(t *testing.T) {
		cfg := makeConfig(true, "UTC", []dialScheduleSlot{
			{Days: []int{3, 4}, Start: "22:00", End: "06:00"},
		})
		// Wednesday 23:00 → allowed (same day, overnight)
		if !campaignDialScheduleAllowed(cfg, time.Date(2026, 5, 6, 23, 0, 0, 0, time.UTC)) {
			t.Error("should allow at 23:00 in overnight window")
		}
		// Thursday 04:00 → allowed (next day, in window days)
		if !campaignDialScheduleAllowed(cfg, time.Date(2026, 5, 7, 4, 0, 0, 0, time.UTC)) {
			t.Error("should allow at 04:00 in overnight window (next day)")
		}
		// Wednesday 14:00 → blocked
		if campaignDialScheduleAllowed(cfg, time.Date(2026, 5, 6, 14, 0, 0, 0, time.UTC)) {
			t.Error("should block at 14:00 outside overnight window")
		}
	})

	t.Run("wrong day blocks", func(t *testing.T) {
		now := time.Date(2026, 5, 4, 12, 0, 0, 0, time.UTC) // Monday = 1
		cfg := makeConfig(true, "UTC", []dialScheduleSlot{
			{Days: []int{3}, Start: "00:00", End: "23:59"}, // Wednesday only
		})
		if campaignDialScheduleAllowed(cfg, now) {
			t.Error("should block on Monday when only Wednesday configured")
		}
	})

	t.Run("invalid json allows", func(t *testing.T) {
		if !campaignDialScheduleAllowed([]byte("not json"), time.Now()) {
			t.Error("invalid json should allow")
		}
	})
}
