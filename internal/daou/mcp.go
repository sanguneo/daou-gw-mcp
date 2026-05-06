package daou

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"time"
)

type mcpReq struct {
	JSONRPC string         `json:"jsonrpc"`
	ID      any            `json:"id,omitempty"`
	Method  string         `json:"method"`
	Params  map[string]any `json:"params,omitempty"`
}

type mcpResp struct {
	JSONRPC string `json:"jsonrpc"`
	ID      any    `json:"id,omitempty"`
	Result  any    `json:"result,omitempty"`
	Error   any    `json:"error,omitempty"`
}

func RunMCP() error {
	dec := json.NewDecoder(bufio.NewReader(os.Stdin))
	enc := json.NewEncoder(os.Stdout)
	for {
		var req mcpReq
		if err := dec.Decode(&req); err != nil {
			if err == io.EOF {
				return nil
			}
			return err
		}
		resp := handleMCP(req)
		if err := enc.Encode(resp); err != nil {
			return err
		}
	}
}

func handleMCP(req mcpReq) mcpResp {
	switch req.Method {
	case "initialize":
		return mcpResp{JSONRPC: "2.0", ID: req.ID, Result: map[string]any{
			"protocolVersion": "2024-11-05",
			"serverInfo":      map[string]any{"name": "daou-gw-cli", "version": "0.1.0"},
			"capabilities":    map[string]any{"tools": map[string]any{}},
		}}
	case "tools/list":
		return mcpResp{JSONRPC: "2.0", ID: req.ID, Result: map[string]any{"tools": mcpTools()}}
	case "tools/call":
		return mcpResp{JSONRPC: "2.0", ID: req.ID, Result: mcpCall(req.Params)}
	default:
		return mcpResp{JSONRPC: "2.0", ID: req.ID, Error: map[string]any{"code": -32601, "message": "method not found"}}
	}
}

func mcpTools() []map[string]any {
	return []map[string]any{
		{"name": "config_show", "description": "Show local daou-gw config", "inputSchema": map[string]any{"type": "object", "properties": map[string]any{}}},
		{"name": "login", "description": "Login and save session cookies", "inputSchema": map[string]any{"type": "object", "properties": map[string]any{"username": map[string]any{"type": "string"}, "password": map[string]any{"type": "string"}, "base_url": map[string]any{"type": "string"}}}},
		{"name": "session", "description": "Validate saved session", "inputSchema": map[string]any{"type": "object", "properties": map[string]any{}}},
		{"name": "attendance_status", "description": "Check attendance state", "inputSchema": map[string]any{"type": "object", "properties": map[string]any{}}},
		{"name": "attendance_in", "description": "Clock in using saved session", "inputSchema": map[string]any{"type": "object", "properties": map[string]any{}}},
		{"name": "attendance_out", "description": "Clock out using saved session", "inputSchema": map[string]any{"type": "object", "properties": map[string]any{}}},
		{"name": "mail_list", "description": "List mail over HTTP using saved session", "inputSchema": map[string]any{"type": "object", "properties": map[string]any{"folder": map[string]any{"type": "string"}, "page": map[string]any{"type": "integer"}, "size": map[string]any{"type": "integer"}}}},
		{"name": "mail_search", "description": "Search mail over HTTP using saved session", "inputSchema": map[string]any{"type": "object", "properties": map[string]any{"folder": map[string]any{"type": "string"}, "query": map[string]any{"type": "string"}, "page": map[string]any{"type": "integer"}, "size": map[string]any{"type": "integer"}}}},
		{"name": "mail_delete", "description": "Delete mail over HTTP using saved session", "inputSchema": map[string]any{"type": "object", "properties": map[string]any{"ids": map[string]any{"type": "array", "items": map[string]any{"type": "string"}}, "id": map[string]any{"type": "string"}}}},
		{"name": "approval_todo", "description": "List approval todo items over HTTP using saved session", "inputSchema": map[string]any{"type": "object", "properties": map[string]any{"type": map[string]any{"type": "string"}, "page": map[string]any{"type": "integer"}, "size": map[string]any{"type": "integer"}, "searchtype": map[string]any{"type": "string"}, "keyword": map[string]any{"type": "string"}, "duration": map[string]any{"type": "string"}, "from_date": map[string]any{"type": "string"}, "to_date": map[string]any{"type": "string"}}}},
		{"name": "approval_reference", "description": "List approval reference/read/view items over HTTP using saved session", "inputSchema": map[string]any{"type": "object", "properties": map[string]any{"kind": map[string]any{"type": "string"}, "page": map[string]any{"type": "integer"}, "size": map[string]any{"type": "integer"}, "searchtype": map[string]any{"type": "string"}, "keyword": map[string]any{"type": "string"}, "duration": map[string]any{"type": "string"}, "from_date": map[string]any{"type": "string"}, "to_date": map[string]any{"type": "string"}}}},
		{"name": "approval_count", "description": "Get approval todo count over HTTP using saved session", "inputSchema": map[string]any{"type": "object", "properties": map[string]any{}}},
	}
}

func mcpCall(params map[string]any) map[string]any {
	name, _ := params["name"].(string)
	arguments, _ := params["arguments"].(map[string]any)
	text := ""
	switch name {
	case "config_show":
		cfg, _ := LoadConfig()
		text = formatJSON(cfg)
	case "login":
		cfg, _ := LoadConfig()
		cfg = updatedConfig(cfg,
			str(arguments["username"]), str(arguments["password"]), str(arguments["base_url"]),
			str(arguments["mail_list_url"]), str(arguments["mail_search_url"]), str(arguments["mail_delete_url"]))
		_ = SaveConfig(cfg)
		if cfg.Username == "" || cfg.Password == "" {
			text = "missing username/password"
			break
		}
		sess, err := Login(cfg.BaseURL, cfg.Username, cfg.Password)
		if err != nil {
			text = err.Error()
			break
		}
		_ = SaveSession(sess)
		text = formatJSON(sess)
	case "session":
		cfg, _ := LoadConfig()
		sess, _ := LoadSession()
		ok, err := ValidateSession(cfg.BaseURL, sess)
		text = formatJSON(map[string]any{"valid": ok, "error": errString(err), "session": sess})
	case "attendance_status":
		text = mcpAttendanceStatus()
	case "attendance_in":
		text = mcpAttendanceAction("in")
	case "attendance_out":
		text = mcpAttendanceAction("out")
	case "mail_list":
		folder := str(arguments["folder"])
		page := intFrom(arguments["page"], 1)
		size := intFrom(arguments["size"], 20)
		text, _ = mailList(folder, page, size)
	case "mail_search":
		folder := str(arguments["folder"])
		query := str(arguments["query"])
		page := intFrom(arguments["page"], 1)
		size := intFrom(arguments["size"], 20)
		text, _ = mailSearch(folder, query, page, size)
	case "mail_delete":
		ids := stringSliceFrom(arguments["ids"])
		if id := str(arguments["id"]); id != "" {
			ids = append(ids, id)
		}
		folder := str(arguments["folder"])
		if folder == "" {
			folder = "Inbox"
		}
		text, _ = mailDelete(normalizeMailIDs(ids), normalizeMailFolder(folder))
	case "approval_todo":
		text, _ = approvalTodo(
			str(arguments["type"]),
			intFrom(arguments["page"], 1),
			intFrom(arguments["size"], 20),
			str(arguments["searchtype"]),
			str(arguments["keyword"]),
			str(arguments["duration"]),
			str(arguments["from_date"]),
			str(arguments["to_date"]),
		)
	case "approval_reference":
		text, _ = approvalReference(
			str(arguments["kind"]),
			intFrom(arguments["page"], 1),
			intFrom(arguments["size"], 20),
			str(arguments["searchtype"]),
			str(arguments["keyword"]),
			str(arguments["duration"]),
			str(arguments["from_date"]),
			str(arguments["to_date"]),
		)
	case "approval_count":
		text, _ = approvalCount()
	default:
		text = "unknown tool"
	}
	return map[string]any{"content": []any{map[string]any{"type": "text", "text": text}}, "isError": false}
}

func mcpAttendanceStatus() string {
	cfg, sess, err := ensureSession()
	if err != nil {
		return err.Error()
	}
	client, _, err := HTTPClient(cfg.BaseURL, sess, 10*time.Second)
	if err != nil {
		return err.Error()
	}
	user, err := UserSession(client, cfg.BaseURL)
	if err != nil {
		return err.Error()
	}
	today := time.Now().In(kst).Format("2006-01-02")
	leave := getTodayLeave(os.Getenv("NOTION_TOKEN"), os.Getenv("NOTION_DATABASE_ID"))
	holiday := isHoliday(client, cfg.BaseURL, today)
	clockedIn, clockedOut, _ := attendanceHistory(client, cfg.BaseURL, fmt.Sprintf("%d", user.ID), today)
	return formatJSON(AttendanceStatus{UserID: user.ID, Today: today, Leave: leave, Holiday: holiday, ClockedIn: clockedIn, ClockedOut: clockedOut})
}

func mcpAttendanceAction(direction string) string {
	cfg, sess, err := ensureSession()
	if err != nil {
		return err.Error()
	}
	client, _, err := HTTPClient(cfg.BaseURL, sess, 10*time.Second)
	if err != nil {
		return err.Error()
	}
	user, err := UserSession(client, cfg.BaseURL)
	if err != nil {
		return err.Error()
	}
	now := time.Now().In(kst)
	today := now.Format("2006-01-02")
	if getTodayLeave(os.Getenv("NOTION_TOKEN"), os.Getenv("NOTION_DATABASE_ID")) == "연차" {
		return "skip: leave"
	}
	if isHoliday(client, cfg.BaseURL, today) {
		return "skip: holiday"
	}
	clockedIn, clockedOut, _ := attendanceHistory(client, cfg.BaseURL, fmt.Sprintf("%d", user.ID), today)
	if direction == "in" {
		if clockedIn {
			return "already in"
		}
		if err := clockIn(client, cfg.BaseURL, user.ID, now); err != nil {
			return err.Error()
		}
		return formatJSON(map[string]any{"ok": true, "action": direction, "userId": user.ID, "today": today})
	}
	if !clockedIn {
		return "skip: not clocked in"
	}
	if clockedOut {
		return "already out"
	}
	if err := clockOut(client, cfg.BaseURL, user.ID, now); err != nil {
		return err.Error()
	}
	return formatJSON(map[string]any{"ok": true, "action": direction, "userId": user.ID, "today": today})
}

func str(v any) string {
	s, _ := v.(string)
	return s
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func stringSliceFrom(v any) []string {
	raw, _ := v.([]any)
	if len(raw) == 0 {
		return nil
	}
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		if s, ok := item.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

func intFrom(v any, fallback int) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case float32:
		return int(n)
	case int:
		return n
	case int64:
		return int(n)
	case json.Number:
		if i, err := n.Int64(); err == nil {
			return int(i)
		}
	}
	return fallback
}
