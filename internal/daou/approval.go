package daou

import (
	"encoding/json"
	"flag"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

func runApprovalCommand(args []string) int {
	if len(args) == 0 {
		usageApproval(os.Stderr)
		return 1
	}
	if isHelpArg(args) {
		usageApproval(os.Stdout)
		return 0
	}
	switch args[0] {
	case "todo":
		return runApprovalTodo(args[1:])
	case "reference", "ref":
		return runApprovalReference(args[1:])
	case "count":
		return runApprovalCount(args[1:])
	default:
		usageApproval(os.Stderr)
		return 1
	}
}

func usageApproval(out *os.File) {
	fmt.Fprintln(out, "usage: daou-gw-cli approval <todo|reference|count>")
	fmt.Fprintln(out, "")
	fmt.Fprintln(out, "subcommands:")
	fmt.Fprintln(out, "  todo      [--type all|wait|hold] [--page 1] [--size 20] [--searchtype <type>] [--keyword <text>] [--duration all|period] [--from-date YYYY-MM-DD] [--to-date YYYY-MM-DD] [--json]")
	fmt.Fprintln(out, "  reference [--kind reference|read|view] [--page 1] [--size 20] [--searchtype <type>] [--keyword <text>] [--duration all|period] [--from-date YYYY-MM-DD] [--to-date YYYY-MM-DD] [--json]")
	fmt.Fprintln(out, "  count     [--json]")
}

func runApprovalTodo(args []string) int {
	if isHelpArg(args) {
		fmt.Fprintln(os.Stdout, "usage: daou-gw-cli approval todo [--type all|wait|hold] [--page 1] [--size 20] [--searchtype <type>] [--keyword <text>] [--duration all|period] [--from-date YYYY-MM-DD] [--to-date YYYY-MM-DD] [--json]")
		return 0
	}
	fs := flag.NewFlagSet("approval todo", flag.ContinueOnError)
	jsonOut := fs.Bool("json", false, "json output")
	listType := fs.String("type", "all", "all|wait|hold")
	page := fs.Int("page", 1, "page number (1-based)")
	size := fs.Int("size", 20, "page size")
	searchType := fs.String("searchtype", "", "search type")
	keyword := fs.String("keyword", "", "keyword")
	duration := fs.String("duration", "", "all|period")
	fromDate := fs.String("from-date", "", "YYYY-MM-DD")
	toDate := fs.String("to-date", "", "YYYY-MM-DD")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	out, err := approvalTodo(*listType, *page, *size, *searchType, *keyword, *duration, *fromDate, *toDate)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	if *jsonOut {
		fmt.Println(out)
		return 0
	}
	fmt.Print(formatApprovalOutput(out, "todo"))
	return 0
}

func runApprovalReference(args []string) int {
	if isHelpArg(args) {
		fmt.Fprintln(os.Stdout, "usage: daou-gw-cli approval reference [--kind reference|read|view] [--page 1] [--size 20] [--searchtype <type>] [--keyword <text>] [--duration all|period] [--from-date YYYY-MM-DD] [--to-date YYYY-MM-DD] [--json]")
		return 0
	}
	fs := flag.NewFlagSet("approval reference", flag.ContinueOnError)
	jsonOut := fs.Bool("json", false, "json output")
	kind := fs.String("kind", "reference", "reference|read|view")
	page := fs.Int("page", 1, "page number (1-based)")
	size := fs.Int("size", 20, "page size")
	searchType := fs.String("searchtype", "", "search type")
	keyword := fs.String("keyword", "", "keyword")
	duration := fs.String("duration", "", "all|period")
	fromDate := fs.String("from-date", "", "YYYY-MM-DD")
	toDate := fs.String("to-date", "", "YYYY-MM-DD")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	out, err := approvalReference(*kind, *page, *size, *searchType, *keyword, *duration, *fromDate, *toDate)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	if *jsonOut {
		fmt.Println(out)
		return 0
	}
	fmt.Print(formatApprovalOutput(out, "reference"))
	return 0
}

func runApprovalCount(args []string) int {
	if isHelpArg(args) {
		fmt.Fprintln(os.Stdout, "usage: daou-gw-cli approval count [--json]")
		return 0
	}
	fs := flag.NewFlagSet("approval count", flag.ContinueOnError)
	jsonOut := fs.Bool("json", false, "json output")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	out, err := approvalCount()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	if *jsonOut {
		fmt.Println(out)
		return 0
	}
	fmt.Print(formatApprovalOutput(out, "count"))
	return 0
}

func approvalTodo(listType string, page, size int, searchType, keyword, duration, fromDate, toDate string) (string, error) {
	return approvalList("todo", listType, page, size, searchType, keyword, duration, fromDate, toDate)
}

func approvalReference(kind string, page, size int, searchType, keyword, duration, fromDate, toDate string) (string, error) {
	return approvalList("todo", kind, page, size, searchType, keyword, duration, fromDate, toDate)
}

func approvalList(prefix, section string, page, size int, searchType, keyword, duration, fromDate, toDate string) (string, error) {
	cfg, sess, err := ensureSession()
	if err != nil {
		return "", err
	}
	client, _, err := HTTPClient(cfg.BaseURL, sess, 45*time.Second)
	if err != nil {
		return "", err
	}
	if page < 1 {
		page = 1
	}
	if size <= 0 {
		size = 20
	}
	section = strings.ToLower(strings.TrimSpace(section))
	if prefix == "todo" {
		switch section {
		case "all", "wait", "hold", "reference", "read", "view":
		default:
			return "", fmt.Errorf("approval type는 all|wait|hold, reference kind는 reference|read|view")
		}
	} else {
		return "", fmt.Errorf("unsupported approval prefix: %s", prefix)
	}
	q := url.Values{}
	q.Set("page", fmt.Sprintf("%d", page-1))
	q.Set("offset", fmt.Sprintf("%d", size))
	q.Set("property", "document.isEmergency")
	q.Set("direction", "desc")
	q.Set("searchtype", searchType)
	q.Set("keyword", keyword)
	if strings.TrimSpace(duration) != "" {
		q.Set("duration", duration)
	}
	if strings.TrimSpace(fromDate) != "" {
		q.Set("fromDate", fromDate)
	}
	if strings.TrimSpace(toDate) != "" {
		q.Set("toDate", toDate)
	}
	path := strings.TrimRight(cfg.BaseURL, "/") + "/api/approval/" + prefix + "/" + section + "?" + q.Encode()
	resp, err := doJSONGet(client, path, strings.TrimRight(cfg.BaseURL, "/")+"/app/approval/todo")
	if err != nil {
		return "", err
	}
	return prettyJSON(resp)
}

func approvalCount() (string, error) {
	cfg, sess, err := ensureSession()
	if err != nil {
		return "", err
	}
	client, _, err := HTTPClient(cfg.BaseURL, sess, 45*time.Second)
	if err != nil {
		return "", err
	}
	path := strings.TrimRight(cfg.BaseURL, "/") + "/api/approval/todo/count"
	resp, err := doJSONGet(client, path, strings.TrimRight(cfg.BaseURL, "/")+"/app/approval/todo")
	if err != nil {
		return "", err
	}
	return prettyJSON(resp)
}

func doJSONGet(client *http.Client, target, referer string) (any, error) {
	req, err := http.NewRequest(http.MethodGet, target, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if referer != "" {
		req.Header.Set("Referer", referer)
	}
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var out any
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("http %d", resp.StatusCode)
	}
	return out, nil
}

func prettyJSON(v any) (string, error) {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return "", err
	}
	return string(b), nil
}
