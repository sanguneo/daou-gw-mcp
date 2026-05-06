package daou

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestAttendanceHistoryParsesClockInAndOut(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/api/ehr/timeline/month") {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"weekList": []any{map[string]any{
				"dailyList": []any{map[string]any{
					"detailDay":       map[string]any{"day": "2026-04-29"},
					"clockInHistory":  map[string]any{"id": 1},
					"clockOutHistory": map[string]any{"id": 2},
				}},
			}},
		})
	}))
	defer server.Close()

	clockedIn, clockedOut, err := attendanceHistory(server.Client(), server.URL, "123", "2026-04-29")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !clockedIn || !clockedOut {
		t.Fatalf("expected in/out true, got in=%v out=%v", clockedIn, clockedOut)
	}
}

func TestClockOutUsesClockOutEndpoint(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/api/ehr/timeline/status/clockOut") {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Fatalf("expected POST, got %s", r.Method)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"code": 200})
	}))
	defer server.Close()

	now := time.Date(2026, 4, 29, 18, 30, 0, 0, kst)
	if err := clockOut(server.Client(), server.URL, 123, now); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}
