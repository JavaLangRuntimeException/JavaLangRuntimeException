package server

import (
	"net/http/httptest"
	"testing"
)

func TestIsHealthCheck(t *testing.T) {
	for path, want := range map[string]bool{"/healthz": true, "/readyz": true, "/taramanji.reservation.v1.ReservationService/GetBusy": false, "/": false} {
		if got := isHealthCheck(httptest.NewRequest("GET", path, nil)); got != want {
			t.Errorf("%s: %v", path, got)
		}
	}
}
