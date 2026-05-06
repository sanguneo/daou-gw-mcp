package daou

import (
	"flag"
	"fmt"
	"os"
	"strings"
	"time"
)

func RunCLI(args []string) int {
	if len(args) == 0 {
		usage(os.Stderr)
		return 1
	}
	switch args[0] {
	case "config":
		return runConfig(args[1:])
	case "login":
		return runLogin(args[1:])
	case "session":
		return runSession(args[1:])
	case "attendance":
		return runAttendance(args[1:])
	case "mail":
		return runMail(args[1:])
	case "approval":
		return runApproval(args[1:])
	case "help", "-h", "--help":
		return runHelp(args[1:])
	default:
		usage(os.Stderr)
		return 1
	}
}

func runHelp(args []string) int {
	if len(args) == 0 {
		usage(os.Stdout)
		return 0
	}
	switch args[0] {
	case "config":
		usageConfig(os.Stdout)
	case "login":
		usageLogin(os.Stdout)
	case "session":
		usageSession(os.Stdout)
	case "attendance":
		usageAttendance(os.Stdout)
	case "mail":
		usageMail(os.Stdout)
	case "approval":
		usageApproval(os.Stdout)
	default:
		usage(os.Stderr)
		return 1
	}
	return 0
}

func isHelpArg(args []string) bool {
	return len(args) > 0 && (args[0] == "help" || args[0] == "-h" || args[0] == "--help")
}

func usage(out *os.File) {
	fmt.Fprintln(out, "usage: daou-gw-cli <command> [subcommand] [flags]")
	fmt.Fprintln(out, "")
	fmt.Fprintln(out, "commands:")
	fmt.Fprintln(out, "  config      show or update saved config")
	fmt.Fprintln(out, "  login       login and save session")
	fmt.Fprintln(out, "  session     validate saved session")
	fmt.Fprintln(out, "  attendance  check or run attendance")
	fmt.Fprintln(out, "  mail        list, search, or delete mail")
	fmt.Fprintln(out, "  approval    list approval todo/reference documents")
	fmt.Fprintln(out, "")
	fmt.Fprintln(out, "examples:")
	fmt.Fprintln(out, "  daou-gw-cli login --username <id> --password <pw>")
	fmt.Fprintln(out, "  daou-gw-cli attendance status --json")
	fmt.Fprintln(out, "  daou-gw-cli attendance in")
	fmt.Fprintln(out, "  daou-gw-cli attendance out")
	fmt.Fprintln(out, "  daou-gw-cli mail search --query AWS --json")
	fmt.Fprintln(out, "  daou-gw-cli approval reference --kind reference --json")
	fmt.Fprintln(out, "")
	fmt.Fprintln(out, "help:")
	fmt.Fprintln(out, "  daou-gw-cli help <command>")
}

func usageConfig(out *os.File) {
	fmt.Fprintln(out, "usage: daou-gw-cli config <show|set>")
	fmt.Fprintln(out, "")
	fmt.Fprintln(out, "subcommands:")
	fmt.Fprintln(out, "  show")
	fmt.Fprintln(out, "  set [--username <id>] [--password <pw>] [--base-url <url>] [--mail-list-url <url>] [--mail-search-url <url>] [--mail-delete-url <url>]")
}

func usageConfigSet(out *os.File) {
	fmt.Fprintln(out, "usage: daou-gw-cli config set [--username <id>] [--password <pw>] [--base-url <url>] [--mail-list-url <url>] [--mail-search-url <url>] [--mail-delete-url <url>]")
}

func usageLogin(out *os.File) {
	fmt.Fprintln(out, "usage: daou-gw-cli login --username <id> --password <pw> [--base-url <url>] [--json]")
}

func usageSession(out *os.File) {
	fmt.Fprintln(out, "usage: daou-gw-cli session [--json]")
}

func usageAttendance(out *os.File) {
	fmt.Fprintln(out, "usage: daou-gw-cli attendance <status|in|out>")
	fmt.Fprintln(out, "")
	fmt.Fprintln(out, "subcommands:")
	fmt.Fprintln(out, "  status  [--json]")
	fmt.Fprintln(out, "  in      [--json]")
	fmt.Fprintln(out, "  out     [--json]")
}

func usageMail(out *os.File) {
	fmt.Fprintln(out, "usage: daou-gw-cli mail <list|search|delete>")
	fmt.Fprintln(out, "")
	fmt.Fprintln(out, "subcommands:")
	fmt.Fprintln(out, "  list   [--folder inbox] [--page 1] [--size 20] [--json]")
	fmt.Fprintln(out, "  search --query <text> [--folder inbox] [--page 1] [--size 20] [--json]")
	fmt.Fprintln(out, "  delete --id <mail-id> [--id <mail-id> ...] [--folder Inbox] [--json]")
}

func usageMailSearch(out *os.File) {
	fmt.Fprintln(out, "usage: daou-gw-cli mail search --query <text> [--folder inbox] [--page 1] [--size 20] [--json]")
}

func usageMailDelete(out *os.File) {
	fmt.Fprintln(out, "usage: daou-gw-cli mail delete --id <mail-id> [--id <mail-id> ...] [--folder Inbox] [--json]")
}

func runConfig(args []string) int {
	if len(args) == 0 {
		usageConfig(os.Stderr)
		return 1
	}
	if isHelpArg(args) {
		usageConfig(os.Stdout)
		return 0
	}
	switch args[0] {
	case "show":
		cfg, err := LoadConfig()
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
		fmt.Print(formatConfig(cfg))
		return 0
	case "set":
		if isHelpArg(args[1:]) {
			usageConfigSet(os.Stdout)
			return 0
		}
		fs := flag.NewFlagSet("config set", flag.ContinueOnError)
		username := fs.String("username", "", "gw username")
		password := fs.String("password", "", "gw password")
		baseURL := fs.String("base-url", "", "gw base url")
		mailListURL := fs.String("mail-list-url", "", "mail list url")
		mailSearchURL := fs.String("mail-search-url", "", "mail search url")
		mailDeleteURL := fs.String("mail-delete-url", "", "mail delete url")
		if err := fs.Parse(args[1:]); err != nil {
			return 2
		}
		if fs.NFlag() == 0 {
			usageConfigSet(os.Stderr)
			return 1
		}
		cfg, _ := LoadConfig()
		cfg = updatedConfig(cfg, *username, *password, *baseURL, *mailListURL, *mailSearchURL, *mailDeleteURL)
		if err := SaveConfig(cfg); err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
		fmt.Println("ok")
		return 0
	default:
		usageConfig(os.Stderr)
		return 1
	}
}

func runLogin(args []string) int {
	if isHelpArg(args) {
		usageLogin(os.Stdout)
		return 0
	}
	fs := flag.NewFlagSet("login", flag.ContinueOnError)
	jsonOut := fs.Bool("json", false, "json output")
	baseURL := fs.String("base-url", "", "gw base url")
	username := fs.String("username", "", "gw username")
	password := fs.String("password", "", "gw password")
	if err := fs.Parse(args); err != nil {
		return 2
	}

	cfg, _ := LoadConfig()
	cfg = updatedConfig(cfg, *username, *password, *baseURL, "", "", "")
	if strings.TrimSpace(cfg.Username) == "" || strings.TrimSpace(cfg.Password) == "" {
		usageLogin(os.Stderr)
		return 1
	}
	if err := SaveConfig(cfg); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}

	sess, err := Login(cfg.BaseURL, cfg.Username, cfg.Password)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	if err := SaveSession(sess); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	if *jsonOut {
		fmt.Println(formatJSON(sess))
		return 0
	}
	fmt.Println("login ok")
	return 0
}

func runSession(args []string) int {
	if isHelpArg(args) {
		usageSession(os.Stdout)
		return 0
	}
	fs := flag.NewFlagSet("session", flag.ContinueOnError)
	jsonOut := fs.Bool("json", false, "json output")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	cfg, _ := LoadConfig()
	sess, err := LoadSession()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	if cfg.BaseURL == "" {
		cfg.BaseURL = defaultBaseURL
	}
	ok, err := ValidateSession(cfg.BaseURL, sess)
	if err != nil && !*jsonOut {
		fmt.Fprintln(os.Stderr, err)
	}
	if *jsonOut {
		payload := map[string]any{"valid": ok, "session": sess}
		if err != nil {
			payload["error"] = err.Error()
		}
		fmt.Println(formatJSON(payload))
		return 0
	}
	if ok {
		fmt.Println("valid")
	} else {
		fmt.Println("invalid")
	}
	return 0
}

func runAttendance(args []string) int {
	if len(args) == 0 {
		usageAttendance(os.Stderr)
		return 1
	}
	if isHelpArg(args) {
		usageAttendance(os.Stdout)
		return 0
	}
	switch args[0] {
	case "status":
		return runAttendanceStatus(args[1:])
	case "in":
		return runAttendanceIn(args[1:])
	case "out":
		return runAttendanceOut(args[1:])
	default:
		usageAttendance(os.Stderr)
		return 1
	}
}

func ensureSession() (Config, Session, error) {
	cfg, err := LoadConfig()
	if err != nil {
		return Config{}, Session{}, err
	}
	if cfg.BaseURL == "" {
		cfg.BaseURL = defaultBaseURL
	}
	sess, err := LoadSession()
	if err != nil {
		return Config{}, Session{}, err
	}
	if valid, _ := ValidateSession(cfg.BaseURL, sess); valid {
		return cfg, sess, nil
	}
	if cfg.Username == "" || cfg.Password == "" {
		return cfg, Session{}, fmt.Errorf("saved session invalid and no credentials saved")
	}
	sess, err = Login(cfg.BaseURL, cfg.Username, cfg.Password)
	if err != nil {
		return cfg, Session{}, err
	}
	_ = SaveSession(sess)
	return cfg, sess, nil
}

func runAttendanceStatus(args []string) int {
	fs := flag.NewFlagSet("attendance status", flag.ContinueOnError)
	jsonOut := fs.Bool("json", false, "json output")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	cfg, sess, err := ensureSession()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	now := time.Now().In(kst)
	client, _, err := HTTPClient(cfg.BaseURL, sess, 10*time.Second)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	user, err := UserSession(client, cfg.BaseURL)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	today := now.Format("2006-01-02")
	leave := getTodayLeave(os.Getenv("NOTION_TOKEN"), os.Getenv("NOTION_DATABASE_ID"))
	holiday := isHoliday(client, cfg.BaseURL, today)
	clockedIn, clockedOut, err := attendanceHistory(client, cfg.BaseURL, fmt.Sprintf("%d", user.ID), today)
	if err != nil {
		clockedIn = false
		clockedOut = false
	}
	payload := AttendanceStatus{
		UserID: user.ID, Today: today, Leave: leave, Holiday: holiday,
		ClockedIn: clockedIn, ClockedOut: clockedOut,
	}
	if *jsonOut {
		fmt.Println(formatJSON(payload))
		return 0
	}
	fmt.Print(formatAttendanceStatus(payload))
	return 0
}

func runAttendanceIn(args []string) int {
	return runAttendanceAction(args, "in")
}

func runAttendanceOut(args []string) int {
	return runAttendanceAction(args, "out")
}

func runAttendanceAction(args []string, direction string) int {
	fs := flag.NewFlagSet("attendance "+direction, flag.ContinueOnError)
	jsonOut := fs.Bool("json", false, "json output")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	cfg, sess, err := ensureSession()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	client, _, err := HTTPClient(cfg.BaseURL, sess, 10*time.Second)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	user, err := UserSession(client, cfg.BaseURL)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	now := time.Now().In(kst)
	today := now.Format("2006-01-02")
	leave := getTodayLeave(os.Getenv("NOTION_TOKEN"), os.Getenv("NOTION_DATABASE_ID"))
	if leave == "연차" || isHoliday(client, cfg.BaseURL, today) {
		printAttendanceActionResult(*jsonOut, map[string]any{"ok": false, "action": direction, "userId": user.ID, "today": today, "status": "skip", "reason": "leave_or_holiday"}, "건너뜀: 연차 또는 공휴일")
		return 0
	}
	clockedIn, clockedOut, _ := attendanceHistory(client, cfg.BaseURL, fmt.Sprintf("%d", user.ID), today)
	if direction == "in" {
		if clockedIn {
			printAttendanceActionResult(*jsonOut, map[string]any{"ok": true, "action": direction, "userId": user.ID, "today": today, "status": "already"}, "이미 출근 처리됨")
			return 0
		}
		if err := clockIn(client, cfg.BaseURL, user.ID, now); err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 1
		}
		printAttendanceActionResult(*jsonOut, map[string]any{"ok": true, "action": direction, "userId": user.ID, "today": today, "status": "done"}, "출근 처리 완료")
		return 0
	}
	if !clockedIn {
		printAttendanceActionResult(*jsonOut, map[string]any{"ok": false, "action": direction, "userId": user.ID, "today": today, "status": "skip", "reason": "not_clocked_in"}, "건너뜀: 아직 출근 처리 전")
		return 0
	}
	if clockedOut {
		printAttendanceActionResult(*jsonOut, map[string]any{"ok": true, "action": direction, "userId": user.ID, "today": today, "status": "already"}, "이미 퇴근 처리됨")
		return 0
	}
	if err := clockOut(client, cfg.BaseURL, user.ID, now); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	printAttendanceActionResult(*jsonOut, map[string]any{"ok": true, "action": direction, "userId": user.ID, "today": today, "status": "done"}, "퇴근 처리 완료")
	return 0
}

func printAttendanceActionResult(jsonOut bool, payload map[string]any, text string) {
	if jsonOut {
		fmt.Println(formatJSON(payload))
		return
	}
	fmt.Println(text)
}

func runApproval(args []string) int {
	return runApprovalCommand(args)
}
