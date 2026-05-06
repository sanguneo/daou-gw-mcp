package daou

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

type stringList []string

func (s *stringList) String() string { return strings.Join(*s, ",") }
func (s *stringList) Set(v string) error {
	*s = append(*s, v)
	return nil
}

func resolveMailEndpoint(baseURL, configured, envKey, defaultCandidate string, candidates []string) string {
	if v := strings.TrimSpace(configured); v != "" {
		return v
	}
	if envKey != "" {
		if v := strings.TrimSpace(os.Getenv(envKey)); v != "" {
			return v
		}
	}
	if v := strings.TrimSpace(defaultCandidate); v != "" {
		return v
	}
	for _, c := range candidates {
		if v := strings.TrimSpace(c); v != "" {
			return v
		}
	}
	return ""
}

func normalizeMailIDs(in []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(in))
	for _, s := range in {
		id := strings.TrimSpace(s)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}

type MailOptions struct {
	Folder string
	Query  string
	Page   int
	Size   int
	IDs    []string
	JSON   bool
}

func runMail(args []string) int {
	if len(args) == 0 {
		usageMail(os.Stderr)
		return 1
	}
	if isHelpArg(args) {
		usageMail(os.Stdout)
		return 0
	}
	switch args[0] {
	case "list":
		return runMailList(args[1:])
	case "search":
		return runMailSearch(args[1:])
	case "delete":
		return runMailDelete(args[1:])
	default:
		usageMail(os.Stderr)
		return 1
	}
}

func runMailList(args []string) int {
	if isHelpArg(args) {
		fmt.Fprintln(os.Stdout, "usage: daou-gw-cli mail list [--folder inbox] [--page 1] [--size 20] [--json]")
		return 0
	}
	fs := flag.NewFlagSet("mail list", flag.ContinueOnError)
	folder := fs.String("folder", "inbox", "mail folder")
	page := fs.Int("page", 1, "page number")
	size := fs.Int("size", 20, "page size")
	jsonOut := fs.Bool("json", false, "json output")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	out, err := mailList(*folder, *page, *size)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	if *jsonOut {
		fmt.Println(out)
		return 0
	}
	fmt.Print(formatMailOutput(out, "list", *size))
	return 0
}

func runMailSearch(args []string) int {
	if isHelpArg(args) {
		usageMailSearch(os.Stdout)
		return 0
	}
	fs := flag.NewFlagSet("mail search", flag.ContinueOnError)
	folder := fs.String("folder", "inbox", "mail folder")
	query := fs.String("query", "", "search query")
	page := fs.Int("page", 1, "page number")
	size := fs.Int("size", 20, "page size")
	jsonOut := fs.Bool("json", false, "json output")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if strings.TrimSpace(*query) == "" {
		usageMailSearch(os.Stderr)
		return 1
	}
	out, err := mailSearch(*folder, *query, *page, *size)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	if *jsonOut {
		fmt.Println(out)
		return 0
	}
	fmt.Print(formatMailOutput(out, "search", *size))
	return 0
}

func runMailDelete(args []string) int {
	if isHelpArg(args) {
		usageMailDelete(os.Stdout)
		return 0
	}
	fs := flag.NewFlagSet("mail delete", flag.ContinueOnError)
	var ids stringList
	jsonOut := fs.Bool("json", false, "json output")
	folder := fs.String("folder", "Inbox", "mail folder name")
	fs.Var(&ids, "id", "mail id to delete")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	norm := normalizeMailIDs(ids)
	if len(norm) == 0 {
		usageMailDelete(os.Stderr)
		return 1
	}
	out, err := mailDelete(norm, normalizeMailFolder(*folder))
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	if *jsonOut {
		fmt.Println(out)
		return 0
	}
	fmt.Print(formatMailOutput(out, "delete"))
	return 0
}

func normalizeMailFolder(folder string) string {
	s := strings.TrimSpace(folder)
	switch {
	case s == "":
		return "Inbox"
	case strings.EqualFold(s, "inbox"):
		return "Inbox"
	case strings.EqualFold(s, "sent"):
		return "Sent"
	case strings.EqualFold(s, "drafts") || strings.EqualFold(s, "draft"):
		return "Drafts"
	case strings.EqualFold(s, "trash"):
		return "Trash"
	case strings.EqualFold(s, "spam"):
		return "Spam"
	case strings.EqualFold(s, "all"):
		return "all"
	default:
		return s
	}
}

func mailList(folder string, page, size int) (string, error) {
	cfg, sess, err := ensureSession()
	if err != nil {
		return "", err
	}
	client, _, err := HTTPClient(cfg.BaseURL, sess, 12*time.Second)
	if err != nil {
		return "", err
	}
	params := url.Values{}
	folder = normalizeMailFolder(folder)
	params.Set("folder", folder)
	params.Set("page", fmt.Sprintf("%d", page))
	params.Set("size", fmt.Sprintf("%d", size))
	params.Set("offset", fmt.Sprintf("%d", size))
	params.Set("limit", fmt.Sprintf("%d", size))
	postReq := MailRequest{Method: http.MethodPost, Body: map[string]any{"folder": folder, "page": page, "size": size, "offset": size, "limit": size, "pageNo": page, "pageSize": size}}
	if out, err := callMailAction(client, cfg, "list", postReq); err == nil {
		return out, nil
	}
	getReq := MailRequest{Method: http.MethodGet, Query: params}
	return callMailAction(client, cfg, "list", getReq)
}

func mailSearch(folder, query string, page, size int) (string, error) {
	cfg, sess, err := ensureSession()
	if err != nil {
		return "", err
	}
	client, _, err := HTTPClient(cfg.BaseURL, sess, 12*time.Second)
	if err != nil {
		return "", err
	}
	params := url.Values{}
	folder = normalizeMailFolder(folder)
	params.Set("folder", folder)
	params.Set("query", query)
	params.Set("q", query)
	params.Set("keyword", query)
	params.Set("keyWord", query)
	params.Set("page", fmt.Sprintf("%d", page))
	params.Set("size", fmt.Sprintf("%d", size))
	params.Set("offset", fmt.Sprintf("%d", size))
	params.Set("limit", fmt.Sprintf("%d", size))
	postReq := MailRequest{Method: http.MethodPost, Body: map[string]any{"folder": folder, "query": query, "q": query, "keyword": query, "keyWord": query, "page": page, "size": size, "offset": size, "limit": size, "pageNo": page, "pageSize": size}}
	if out, err := callMailAction(client, cfg, "search", postReq); err == nil {
		return out, nil
	}
	getReq := MailRequest{Method: http.MethodGet, Query: params}
	return callMailAction(client, cfg, "search", getReq)
}

func mailDelete(ids []string, folder string) (string, error) {
	cfg, sess, err := ensureSession()
	if err != nil {
		return "", err
	}
	client, _, err := HTTPClient(cfg.BaseURL, sess, 12*time.Second)
	if err != nil {
		return "", err
	}
	req := MailRequest{
		Method: http.MethodPost,
		Body: map[string]any{
			"folderNames": []string{folder},
			"uids":        ids,
			"folder":      folder,
			"id":          firstOrEmpty(ids),
			"ids":         ids,
			"mailId":      firstOrEmpty(ids),
			"mailIds":     ids,
			"messageId":   firstOrEmpty(ids),
			"messageIds":  ids,
		},
	}
	return callMailAction(client, cfg, "delete", req)
}

type MailRequest struct {
	Method string
	Query  url.Values
	Body   any
}

func callMailAction(client *http.Client, cfg Config, action string, req MailRequest) (string, error) {
	configured := mailConfiguredURL(cfg, action)
	envKey := mailEnvKey(action)
	defaultCandidate := mailDefaultCandidate(action)
	candidates := mailFallbackCandidates(action)
	endpoint := resolveMailEndpoint(cfg.BaseURL, configured, envKey, defaultCandidate, candidates)
	urls := candidateURLs(cfg.BaseURL, endpoint, candidates)
	if len(urls) == 0 {
		return "", errors.New("mail endpoint 없음")
	}
	var lastErr error
	for _, target := range urls {
		respBody, status, _, err := doMailRequest(client, target, req)
		if err != nil {
			lastErr = err
			continue
		}
		if status >= 400 {
			lastErr = fmt.Errorf("%s http %d: %s", action, status, strings.TrimSpace(string(respBody)))
			continue
		}
		trim := strings.TrimSpace(string(respBody))
		if trim == "" {
			return formatJSON(map[string]any{"endpoint": target, "status": status, "ok": true}), nil
		}
		if json.Valid(respBody) {
			var out any
			if err := json.Unmarshal(respBody, &out); err == nil {
				return formatJSON(map[string]any{"endpoint": target, "status": status, "data": out}), nil
			}
		}
		if strings.HasPrefix(trim, "<") {
			lastErr = fmt.Errorf("%s returned html from %s", action, target)
			continue
		}
		return formatJSON(map[string]any{"endpoint": target, "status": status, "body": trim}), nil
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("%s request failed", action)
	}
	return "", lastErr
}

func doMailRequest(client *http.Client, target string, req MailRequest) ([]byte, int, http.Header, error) {
	reqURL, err := url.Parse(target)
	if err != nil {
		return nil, 0, nil, err
	}
	if req.Query != nil && strings.EqualFold(req.Method, http.MethodGet) {
		reqURL.RawQuery = req.Query.Encode()
	}
	var body io.Reader
	if req.Body != nil && !strings.EqualFold(req.Method, http.MethodGet) {
		payload, err := json.Marshal(req.Body)
		if err != nil {
			return nil, 0, nil, err
		}
		body = bytes.NewReader(payload)
	}
	request, err := http.NewRequest(req.Method, reqURL.String(), body)
	if err != nil {
		return nil, 0, nil, err
	}
	request.Header.Set("Accept", "application/json, text/plain, */*")
	if req.Body != nil && !strings.EqualFold(req.Method, http.MethodGet) {
		request.Header.Set("Content-Type", "application/json")
	}
	resp, err := client.Do(request)
	if err != nil {
		return nil, 0, nil, err
	}
	defer resp.Body.Close()
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, 0, nil, err
	}
	return respBody, resp.StatusCode, resp.Header, nil
}

func candidateURLs(baseURL, endpoint string, candidates []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(candidates)+1)
	add := func(v string) {
		v = strings.TrimSpace(v)
		if v == "" {
			return
		}
		if _, ok := seen[v]; ok {
			return
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	if endpoint != "" {
		add(joinBaseURL(baseURL, endpoint))
	}
	for _, c := range candidates {
		add(joinBaseURL(baseURL, c))
	}
	return out
}

func joinBaseURL(baseURL, endpoint string) string {
	endpoint = strings.TrimSpace(endpoint)
	if endpoint == "" {
		return ""
	}
	if strings.HasPrefix(endpoint, "http://") || strings.HasPrefix(endpoint, "https://") {
		return endpoint
	}
	return strings.TrimRight(baseURL, "/") + "/" + strings.TrimLeft(endpoint, "/")
}

func mailConfiguredURL(cfg Config, action string) string {
	switch action {
	case "list":
		return cfg.MailListURL
	case "search":
		return cfg.MailSearchURL
	case "delete":
		return cfg.MailDeleteURL
	default:
		return ""
	}
}

func mailEnvKey(action string) string {
	switch action {
	case "list":
		return "DAOU_MAIL_LIST_URL"
	case "search":
		return "DAOU_MAIL_SEARCH_URL"
	case "delete":
		return "DAOU_MAIL_DELETE_URL"
	default:
		return ""
	}
}

func mailDefaultCandidate(action string) string {
	switch action {
	case "list":
		return "/api/mail/message/list"
	case "search":
		return "/api/mail/message/list"
	case "delete":
		return "/api/mail/message/delete"
	default:
		return ""
	}
}

func mailFallbackCandidates(action string) []string {
	switch action {
	case "list":
		return []string{"/api/mail/message/list", "/api/mail/list", "/api/mail/message/all", "/api/mail/inbox", "/api/mail/messages"}
	case "search":
		return []string{"/api/mail/message/list", "/api/mail/list", "/api/mail/message/all", "/api/mail/messages"}
	case "delete":
		return []string{"/api/mail/message/delete", "/api/mail/delete", "/api/mail/message/clean", "/api/mail/message/all"}
	default:
		return nil
	}
}

func firstOrEmpty(v []string) string {
	if len(v) == 0 {
		return ""
	}
	return v[0]
}
