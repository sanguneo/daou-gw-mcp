package daou

import "testing"

func TestResolveMailEndpointPrefersConfig(t *testing.T) {
	got := resolveMailEndpoint("https://gw.example.com", "", "DAOU_MAIL_LIST_URL", "/api/mail/list", []string{"/api/email/list"})
	if got != "/api/mail/list" {
		t.Fatalf("got %q", got)
	}
}

func TestResolveMailEndpointFallsBackToCandidates(t *testing.T) {
	got := resolveMailEndpoint("https://gw.example.com", "", "DAOU_MAIL_LIST_URL", "", []string{"/api/email/list", "/api/mail/list"})
	if got != "/api/email/list" {
		t.Fatalf("got %q", got)
	}
}

func TestNormalizeMailIDs(t *testing.T) {
	got := normalizeMailIDs([]string{" 1 ", "", "2", "1"})
	want := []string{"1", "2"}
	if len(got) != len(want) {
		t.Fatalf("len got=%d want=%d (%v)", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got=%v want=%v", got, want)
		}
	}
}
