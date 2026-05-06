package daou

import (
	"encoding/json"
	"fmt"
	"html"
	"sort"
	"strings"
	"time"
)

func formatConfig(cfg Config) string {
	password := "미저장"
	if strings.TrimSpace(cfg.Password) != "" {
		password = "저장됨"
	}
	baseURL := cfg.BaseURL
	if baseURL == "" {
		baseURL = defaultBaseURL
	}
	lines := []string{
		"Daou GW 설정",
		"- Base URL: " + baseURL,
		"- Username: " + valueOrDash(cfg.Username),
		"- Password: " + password,
	}
	if cfg.MailListURL != "" || cfg.MailSearchURL != "" || cfg.MailDeleteURL != "" {
		lines = append(lines,
			"- Mail List URL: "+valueOrDash(cfg.MailListURL),
			"- Mail Search URL: "+valueOrDash(cfg.MailSearchURL),
			"- Mail Delete URL: "+valueOrDash(cfg.MailDeleteURL),
		)
	}
	if !cfg.SavedAt.IsZero() {
		lines = append(lines, "- 저장시각: "+cfg.SavedAt.In(kst).Format("2006-01-02 15:04:05"))
	}
	return strings.Join(lines, "\n") + "\n"
}

func formatMailOutput(raw, action string, displayLimit ...int) string {
	root, ok := parseJSONMap(raw)
	if !ok {
		return strings.TrimSpace(raw)
	}
	data := mapValue(root["data"])
	mailData := mapValue(data["data"])
	if len(mailData) == 0 {
		mailData = data
	}
	switch action {
	case "list", "search":
		limit := 0
		if len(displayLimit) > 0 {
			limit = displayLimit[0]
		}
		return formatMailListLike(mailData, action, limit)
	case "delete":
		return formatMailDelete(root, data)
	default:
		return formatGenericMap(root, "결과")
	}
}

func formatMailListLike(mailData map[string]any, action string, displayLimit int) string {
	title := "메일 목록"
	if action == "search" {
		title = "메일 검색 결과"
	}
	folderName := stringValue(mailData["folderName"])
	folderFullName := stringValue(mailData["folderFullName"])
	if folderName == "" {
		folderName = stringValue(mailData["folderEncName"])
	}
	if folderFullName != "" && folderFullName != folderName {
		folderName = fmt.Sprintf("%s (%s)", valueOrDash(folderName), folderFullName)
	} else {
		folderName = valueOrDash(folderName)
	}
	total := firstNumber(mailData, "total", "messageCount")
	unread := firstNumber(mailData, "unreadMessageCount", "unreadCount")
	page := firstNumber(mailData, "currentPage", "page")
	messages := sliceValue(mailData["messageList"])
	var b strings.Builder
	fmt.Fprintf(&b, "%s\n", title)
	fmt.Fprintf(&b, "- 폴더: %s\n", folderName)
	fmt.Fprintf(&b, "- 전체: %s건", displayNumber(total))
	if unread >= 0 {
		fmt.Fprintf(&b, " / 안읽음: %s건", displayNumber(unread))
	}
	b.WriteString("\n")
	if page >= 0 {
		fmt.Fprintf(&b, "- 페이지: %s\n", displayNumber(page))
	}
	if len(messages) == 0 {
		b.WriteString("- 메일 없음\n")
		return b.String()
	}
	limit := len(messages)
	if displayLimit > 0 && limit > displayLimit {
		limit = displayLimit
	}
	if limit > 20 {
		limit = 20
	}
	for i := 0; i < limit; i++ {
		m := mapValue(messages[i])
		subject := cleanText(firstString(m, "subject", "title"))
		from := cleanText(firstString(m, "fromToSimple", "from", "sender", "senderName"))
		date := formatMaybeTime(firstString(m, "dateUtc", "sentDateUtc", "createdAt", "sentAt"))
		id := firstString(m, "id", "uid", "mailId", "messageId")
		size := firstString(m, "size", "byteSize")
		seen := boolValue(m["seen"])
		state := "읽음"
		if !seen {
			state = "안읽음"
		}
		fmt.Fprintf(&b, "\n%d. [%s] %s\n", i+1, state, valueOrDash(subject))
		fmt.Fprintf(&b, "   보낸사람: %s\n", valueOrDash(from))
		if date != "" {
			fmt.Fprintf(&b, "   시간: %s\n", date)
		}
		line := "   ID: " + valueOrDash(id)
		if size != "" {
			line += " / 크기: " + size
		}
		b.WriteString(line + "\n")
	}
	if len(messages) > limit {
		fmt.Fprintf(&b, "\n... %d건 더 있음. --size로 더 볼 수 있음\n", len(messages)-limit)
	}
	return b.String()
}

func formatMailDelete(root, data map[string]any) string {
	status := firstString(root, "status")
	message := firstString(data, "message")
	if message == "" {
		message = firstString(root, "message")
	}
	lines := []string{"메일 삭제 결과"}
	if status != "" {
		lines = append(lines, "- HTTP: "+status)
	}
	if message != "" {
		lines = append(lines, "- 메시지: "+message)
	}
	if len(lines) == 1 {
		lines = append(lines, "- 완료")
	}
	return strings.Join(lines, "\n") + "\n"
}

func formatApprovalOutput(raw, action string) string {
	root, ok := parseJSONMap(raw)
	if !ok {
		return strings.TrimSpace(raw)
	}
	if action == "count" {
		data := mapValue(root["data"])
		count := firstNumber(data, "docCount", "count", "total")
		readable := boolValue(data["readable"])
		return fmt.Sprintf("전자결재 카운트\n- 문서: %s건\n- 열람 가능: %s\n", displayNumber(count), boolKR(readable, "예", "아니오"))
	}
	items := sliceValue(root["data"])
	page := mapValue(root["page"])
	total := firstNumber(page, "total")
	if total < 0 {
		total = float64(len(items))
	}
	var b strings.Builder
	b.WriteString("전자결재 목록\n")
	fmt.Fprintf(&b, "- 전체: %s건\n", displayNumber(total))
	if p := firstNumber(page, "page"); p >= 0 {
		fmt.Fprintf(&b, "- 페이지: %s\n", displayNumber(p+1))
	}
	if len(items) == 0 {
		b.WriteString("- 문서 없음\n")
		return b.String()
	}
	limit := len(items)
	if limit > 20 {
		limit = 20
	}
	for i := 0; i < limit; i++ {
		item := mapValue(items[i])
		title := cleanText(firstString(item, "title", "documentTitle", "subject", "name"))
		status := cleanText(firstString(item, "status", "approvalStatus", "documentStatus", "state"))
		drafter := cleanText(firstString(item, "drafterName", "draftUserName", "userName", "writerName"))
		date := formatMaybeTime(firstString(item, "draftedAt", "createdAt", "updatedAt"))
		fmt.Fprintf(&b, "\n%d. %s\n", i+1, valueOrDash(title))
		if status != "" {
			fmt.Fprintf(&b, "   상태: %s\n", status)
		}
		if drafter != "" {
			fmt.Fprintf(&b, "   기안자: %s\n", drafter)
		}
		if date != "" {
			fmt.Fprintf(&b, "   시간: %s\n", date)
		}
	}
	return b.String()
}

func formatGenericJSON(raw, title string) string {
	root, ok := parseJSONMap(raw)
	if !ok {
		return strings.TrimSpace(raw)
	}
	return formatGenericMap(root, title)
}

func formatGenericMap(root map[string]any, title string) string {
	var b strings.Builder
	b.WriteString(title + "\n")
	keys := make([]string, 0, len(root))
	for k := range root {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		if strings.HasPrefix(k, "__") {
			continue
		}
		v := root[k]
		switch vv := v.(type) {
		case string:
			fmt.Fprintf(&b, "- %s: %s\n", k, vv)
		case float64, bool:
			fmt.Fprintf(&b, "- %s: %v\n", k, vv)
		}
	}
	return b.String()
}

func parseJSONMap(raw string) (map[string]any, bool) {
	var root map[string]any
	if err := json.Unmarshal([]byte(raw), &root); err != nil {
		return nil, false
	}
	return root, true
}

func mapValue(v any) map[string]any {
	m, _ := v.(map[string]any)
	if m == nil {
		return map[string]any{}
	}
	return m
}

func sliceValue(v any) []any {
	s, _ := v.([]any)
	return s
}

func firstString(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k]; ok && v != nil {
			return stringValue(v)
		}
	}
	return ""
}

func stringValue(v any) string {
	switch x := v.(type) {
	case string:
		return x
	case float64:
		return displayNumber(x)
	case bool:
		return boolKR(x, "예", "아니오")
	case json.Number:
		return x.String()
	default:
		if x == nil {
			return ""
		}
		return fmt.Sprint(x)
	}
}

func firstNumber(m map[string]any, keys ...string) float64 {
	for _, k := range keys {
		if v, ok := m[k]; ok {
			switch n := v.(type) {
			case float64:
				return n
			case int:
				return float64(n)
			case json.Number:
				if f, err := n.Float64(); err == nil {
					return f
				}
			}
		}
	}
	return -1
}

func boolValue(v any) bool {
	b, _ := v.(bool)
	return b
}

func displayNumber(n float64) string {
	if n < 0 {
		return "-"
	}
	if n == float64(int64(n)) {
		return fmt.Sprintf("%d", int64(n))
	}
	return fmt.Sprintf("%.2f", n)
}

func valueOrDash(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "-"
	}
	return s
}

func cleanText(s string) string {
	s = html.UnescapeString(s)
	s = strings.ReplaceAll(s, "\n", " ")
	s = strings.ReplaceAll(s, "\r", " ")
	return strings.Join(strings.Fields(s), " ")
}

func formatMaybeTime(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	layouts := []string{time.RFC3339Nano, time.RFC3339, "2006-01-02T15:04:05.000Z", "2006-01-02 15:04:05"}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, s); err == nil {
			return t.In(kst).Format("2006-01-02 15:04")
		}
	}
	return s
}
