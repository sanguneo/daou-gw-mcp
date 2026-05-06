package daou

import (
	"bytes"
	"io"
	"os"
	"strings"
	"testing"
)

func captureOutput(t *testing.T, fn func() int) (int, string, string) {
	t.Helper()
	oldOut := os.Stdout
	oldErr := os.Stderr
	rOut, wOut, _ := os.Pipe()
	rErr, wErr, _ := os.Pipe()
	os.Stdout = wOut
	os.Stderr = wErr

	code := fn()

	_ = wOut.Close()
	_ = wErr.Close()
	os.Stdout = oldOut
	os.Stderr = oldErr

	var outBuf bytes.Buffer
	var errBuf bytes.Buffer
	_, _ = io.Copy(&outBuf, rOut)
	_, _ = io.Copy(&errBuf, rErr)
	return code, outBuf.String(), errBuf.String()
}

func TestRunLoginMissingCredentialsShowsUsage(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	code, _, errOut := captureOutput(t, func() int { return runLogin(nil) })
	if code == 0 {
		t.Fatalf("expected non-zero code")
	}
	if !strings.Contains(errOut, "usage: daou-gw-cli login") {
		t.Fatalf("expected usage in stderr, got %q", errOut)
	}
}

func TestRunConfigSetMissingFlagsShowsUsage(t *testing.T) {
	code, _, errOut := captureOutput(t, func() int { return runConfig([]string{"set"}) })
	if code == 0 {
		t.Fatalf("expected non-zero code")
	}
	if !strings.Contains(errOut, "usage: daou-gw-cli config set") {
		t.Fatalf("expected usage in stderr, got %q", errOut)
	}
}

func TestRunMailSearchMissingQueryShowsUsage(t *testing.T) {
	code, _, errOut := captureOutput(t, func() int { return runMailSearch(nil) })
	if code == 0 {
		t.Fatalf("expected non-zero code")
	}
	if !strings.Contains(errOut, "usage: daou-gw-cli mail search") {
		t.Fatalf("expected usage in stderr, got %q", errOut)
	}
}

func TestRunMailDeleteMissingIDsShowsUsage(t *testing.T) {
	code, _, errOut := captureOutput(t, func() int { return runMailDelete(nil) })
	if code == 0 {
		t.Fatalf("expected non-zero code")
	}
	if !strings.Contains(errOut, "usage: daou-gw-cli mail delete") {
		t.Fatalf("expected usage in stderr, got %q", errOut)
	}
}

func TestRunCLIHelpShowsRootUsage(t *testing.T) {
	code, out, errOut := captureOutput(t, func() int { return RunCLI([]string{"help"}) })
	if code != 0 {
		t.Fatalf("expected zero code")
	}
	if errOut != "" {
		t.Fatalf("expected empty stderr, got %q", errOut)
	}
	if !strings.Contains(out, "usage: daou-gw-cli <command>") || !strings.Contains(out, "approval") {
		t.Fatalf("expected root usage in stdout, got %q", out)
	}
}

func TestRunCLICommandHelpShowsSpecificUsage(t *testing.T) {
	cases := []struct {
		args []string
		want string
	}{
		{[]string{"help", "config"}, "usage: daou-gw-cli config"},
		{[]string{"login", "help"}, "usage: daou-gw-cli login"},
		{[]string{"attendance", "help"}, "usage: daou-gw-cli attendance"},
		{[]string{"mail", "help"}, "usage: daou-gw-cli mail"},
		{[]string{"approval", "help"}, "usage: daou-gw-cli approval"},
	}
	for _, tc := range cases {
		code, out, errOut := captureOutput(t, func() int { return RunCLI(tc.args) })
		if code != 0 {
			t.Fatalf("%v: expected zero code", tc.args)
		}
		if errOut != "" {
			t.Fatalf("%v: expected empty stderr, got %q", tc.args, errOut)
		}
		if !strings.Contains(out, tc.want) {
			t.Fatalf("%v: expected %q in stdout, got %q", tc.args, tc.want, out)
		}
	}
}

func TestRunAttendanceHelpUsesInOutCommands(t *testing.T) {
	code, out, errOut := captureOutput(t, func() int { return RunCLI([]string{"attendance", "help"}) })
	if code != 0 {
		t.Fatalf("expected zero code")
	}
	if errOut != "" {
		t.Fatalf("expected empty stderr, got %q", errOut)
	}
	for _, forbidden := range []string{"attend-hour", "clockin"} {
		if strings.Contains(out, forbidden) {
			t.Fatalf("did not expect %q in help, got %q", forbidden, out)
		}
	}
	for _, want := range []string{"usage: daou-gw-cli attendance <status|in|out>", "  in      [--json]", "  out     [--json]"} {
		if !strings.Contains(out, want) {
			t.Fatalf("expected %q in help, got %q", want, out)
		}
	}
}

func TestFormatAttendanceStatusPrettyOutput(t *testing.T) {
	got := formatAttendanceStatus(AttendanceStatus{UserID: 123, Today: "2026-04-29", Leave: "출근", Holiday: false, ClockedIn: true, ClockedOut: false})
	for _, want := range []string{"근태 상태", "사용자: 123", "날짜: 2026-04-29", "출근: 완료", "퇴근: 미처리"} {
		if !strings.Contains(got, want) {
			t.Fatalf("expected %q in output, got %q", want, got)
		}
	}
	if strings.Contains(got, "{") || strings.Contains(got, "\"userId\"") {
		t.Fatalf("expected non-json output, got %q", got)
	}
}
