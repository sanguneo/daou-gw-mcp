package daou

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	defaultBaseURL    = "https://gw.aegisep.com"
	configFileName    = "config.json"
	sessionFileName   = "session.json"
	cookiesFileName   = "cookies.json"
	endpointsFileName = "endpoints.json"
)

var kst, _ = time.LoadLocation("Asia/Seoul")

type Config struct {
	BaseURL       string    `json:"base_url"`
	Username      string    `json:"username,omitempty"`
	Password      string    `json:"password,omitempty"`
	MailListURL   string    `json:"mail_list_url,omitempty"`
	MailSearchURL string    `json:"mail_search_url,omitempty"`
	MailDeleteURL string    `json:"mail_delete_url,omitempty"`
	SavedAt       time.Time `json:"saved_at,omitempty"`
}

type SavedCookie struct {
	Name     string    `json:"name"`
	Value    string    `json:"value"`
	Domain   string    `json:"domain,omitempty"`
	Path     string    `json:"path,omitempty"`
	Expires  time.Time `json:"expires,omitempty"`
	Secure   bool      `json:"secure,omitempty"`
	HTTPOnly bool      `json:"http_only,omitempty"`
}

type Session struct {
	UserID    int           `json:"user_id,omitempty"`
	Cookies   []SavedCookie `json:"cookies,omitempty"`
	SavedAt   time.Time     `json:"saved_at,omitempty"`
	UserName  string        `json:"username,omitempty"`
	BaseURL   string        `json:"base_url,omitempty"`
	LastCheck string        `json:"last_check,omitempty"`
}

type AttendanceStatus struct {
	UserID     int    `json:"userId"`
	Today      string `json:"today"`
	Leave      string `json:"leave"`
	Holiday    bool   `json:"holiday"`
	ClockedIn  bool   `json:"clockedIn"`
	ClockedOut bool   `json:"clockedOut"`
}

type PageSnapshot struct {
	PageURL    string    `json:"page_url"`
	Title      string    `json:"title"`
	Location   string    `json:"location"`
	BodyText   string    `json:"body_text,omitempty"`
	Requests   []string  `json:"requests,omitempty"`
	CapturedAt time.Time `json:"captured_at"`
}

type Endpoints struct {
	Mail      []string  `json:"mail,omitempty"`
	Approval  []string  `json:"approval,omitempty"`
	UpdatedAt time.Time `json:"updated_at,omitempty"`
}

func homeDir() (string, error) {
	h, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(h, ".daou"), nil
}

func ensureHome() (string, error) {
	h, err := homeDir()
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(h, 0o700); err != nil {
		return "", err
	}
	return h, nil
}

func configPath() (string, error) {
	h, err := ensureHome()
	if err != nil {
		return "", err
	}
	return filepath.Join(h, configFileName), nil
}
func sessionPath() (string, error) {
	h, err := ensureHome()
	if err != nil {
		return "", err
	}
	return filepath.Join(h, sessionFileName), nil
}
func cookiesPath() (string, error) {
	h, err := ensureHome()
	if err != nil {
		return "", err
	}
	return filepath.Join(h, cookiesFileName), nil
}
func endpointsPath() (string, error) {
	h, err := ensureHome()
	if err != nil {
		return "", err
	}
	return filepath.Join(h, endpointsFileName), nil
}

func readJSON(path string, dst any) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, dst)
}

func writeJSON(path string, v any) error {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o600)
}

func LoadConfig() (Config, error) {
	p, err := configPath()
	if err != nil {
		return Config{}, err
	}
	var cfg Config
	if err := readJSON(p, &cfg); err != nil {
		if os.IsNotExist(err) {
			return Config{BaseURL: defaultBaseURL}, nil
		}
		return Config{}, err
	}
	if cfg.BaseURL == "" {
		cfg.BaseURL = defaultBaseURL
	}
	return cfg, nil
}

func SaveConfig(cfg Config) error {
	if cfg.BaseURL == "" {
		cfg.BaseURL = defaultBaseURL
	}
	cfg.SavedAt = time.Now().In(kst)
	p, err := configPath()
	if err != nil {
		return err
	}
	return writeJSON(p, cfg)
}

func LoadSession() (Session, error) {
	p, err := sessionPath()
	if err != nil {
		return Session{}, err
	}
	var s Session
	if err := readJSON(p, &s); err != nil {
		if os.IsNotExist(err) {
			return Session{}, nil
		}
		return Session{}, err
	}
	return s, nil
}

func SaveSession(s Session) error {
	s.SavedAt = time.Now().In(kst)
	p, err := sessionPath()
	if err != nil {
		return err
	}
	return writeJSON(p, s)
}

func LoadEndpoints() (Endpoints, error) {
	p, err := endpointsPath()
	if err != nil {
		return Endpoints{}, err
	}
	var e Endpoints
	if err := readJSON(p, &e); err != nil {
		if os.IsNotExist(err) {
			return Endpoints{}, nil
		}
		return Endpoints{}, err
	}
	return e, nil
}

func SaveEndpoints(e Endpoints) error {
	e.UpdatedAt = time.Now().In(kst)
	p, err := endpointsPath()
	if err != nil {
		return err
	}
	return writeJSON(p, e)
}

func cookiesToSaved(in []*http.Cookie) []SavedCookie {
	out := make([]SavedCookie, 0, len(in))
	for _, c := range in {
		out = append(out, SavedCookie{Name: c.Name, Value: c.Value, Domain: c.Domain, Path: c.Path, Expires: c.Expires, Secure: c.Secure, HTTPOnly: c.HttpOnly})
	}
	return out
}

func savedToCookies(in []SavedCookie) []*http.Cookie {
	out := make([]*http.Cookie, 0, len(in))
	for _, c := range in {
		cc := c
		out = append(out, &http.Cookie{Name: cc.Name, Value: cc.Value, Domain: cc.Domain, Path: cc.Path, Expires: cc.Expires, Secure: cc.Secure, HttpOnly: cc.HTTPOnly})
	}
	return out
}

func cookieJarFromSession(baseURL string, sess Session) (*cookiejar.Jar, error) {
	jar, err := cookiejar.New(nil)
	if err != nil {
		return nil, err
	}
	if len(sess.Cookies) == 0 {
		return jar, nil
	}
	u, err := url.Parse(baseURL)
	if err != nil {
		return nil, err
	}
	jar.SetCookies(u, savedToCookies(sess.Cookies))
	return jar, nil
}

func HTTPClient(baseURL string, sess Session, timeout time.Duration) (*http.Client, *cookiejar.Jar, error) {
	jar, err := cookieJarFromSession(baseURL, sess)
	if err != nil {
		return nil, nil, err
	}
	return &http.Client{Jar: jar, Timeout: timeout}, jar, nil
}

func saveJarCookies(baseURL string, jar *cookiejar.Jar) ([]SavedCookie, error) {
	u, err := url.Parse(baseURL)
	if err != nil {
		return nil, err
	}
	return cookiesToSaved(jar.Cookies(u)), nil
}

func Login(baseURL, username, password string) (Session, error) {
	if baseURL == "" {
		baseURL = defaultBaseURL
	}
	jar, _ := cookiejar.New(nil)
	client := &http.Client{Jar: jar, Timeout: 12 * time.Second}

	body := map[string]string{"username": username, "password": password}
	b, _ := json.Marshal(body)
	req, _ := http.NewRequest("POST", strings.TrimRight(baseURL, "/")+"/api/login", bytes.NewBuffer(b))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return Session{}, err
	}
	io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
	if resp.StatusCode >= 400 {
		return Session{}, fmt.Errorf("login http %d", resp.StatusCode)
	}

	user, err := UserSession(client, baseURL)
	if err != nil {
		return Session{}, err
	}

	saved, err := saveJarCookies(baseURL, jar)
	if err != nil {
		return Session{}, err
	}
	return Session{UserID: user.ID, UserName: username, BaseURL: baseURL, Cookies: saved, LastCheck: time.Now().In(kst).Format(time.RFC3339)}, nil
}

type UserSessionInfo struct {
	ID   int    `json:"id"`
	Name string `json:"name,omitempty"`
}

func UserSession(client *http.Client, baseURL string) (UserSessionInfo, error) {
	var out struct {
		Data struct {
			ID   int    `json:"id"`
			Name string `json:"name"`
		} `json:"data"`
	}
	req, _ := http.NewRequest("GET", strings.TrimRight(baseURL, "/")+"/api/user/session", nil)
	resp, err := client.Do(req)
	if err != nil {
		return UserSessionInfo{}, err
	}
	defer resp.Body.Close()
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return UserSessionInfo{}, err
	}
	if out.Data.ID == 0 {
		return UserSessionInfo{}, errors.New("empty session")
	}
	return UserSessionInfo{ID: out.Data.ID, Name: out.Data.Name}, nil
}

func ValidateSession(baseURL string, sess Session) (bool, error) {
	client, _, err := HTTPClient(baseURL, sess, 10*time.Second)
	if err != nil {
		return false, err
	}
	_, err = UserSession(client, baseURL)
	return err == nil, err
}

func getUserID(client *http.Client, baseURL string) (int, error) {
	s, err := UserSession(client, baseURL)
	if err != nil {
		return 0, err
	}
	return s.ID, nil
}

func getTodayLeave(token, db string) string {
	if token == "" || db == "" {
		return "출근"
	}
	url := fmt.Sprintf("https://api.notion.com/v1/databases/%s/query", db)
	today := time.Now().In(kst).Format("2006-01-02")
	body := map[string]any{"filter": map[string]any{"property": "날짜", "date": map[string]any{"equals": today}}}
	b, _ := json.Marshal(body)
	req, _ := http.NewRequest("POST", url, bytes.NewBuffer(b))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Notion-Version", "2022-06-28")
	req.Header.Set("Content-Type", "application/json")
	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return "출근"
	}
	defer resp.Body.Close()
	var result map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "출근"
	}
	results, ok := result["results"].([]any)
	if !ok {
		return "출근"
	}
	for _, r := range results {
		page := r.(map[string]any)
		props := page["properties"].(map[string]any)
		status := props["상태"].(map[string]any)
		selectVal := status["select"].(map[string]any)
		name, _ := selectVal["name"].(string)
		t := strings.ReplaceAll(strings.ToLower(name), " ", "")
		switch {
		case strings.Contains(t, "연차"):
			return "연차"
		case strings.Contains(t, "오전반차"):
			return "오전반차"
		case strings.Contains(t, "오후반차"):
			return "오후반차"
		}
	}
	return "출근"
}

func isHoliday(client *http.Client, baseURL, today string) bool {
	t, _ := time.Parse("2006-01-02", today)
	from := t.AddDate(0, 0, -50).Format("2006-01-02")
	to := t.AddDate(0, 0, 10).Format("2006-01-02")
	params := url.Values{}
	params.Set("timeMin", from+"T00:00:00.000+09:00")
	params.Set("timeMax", to+"T23:59:59.999+09:00")
	params.Add("calendarIds[]", "11")
	url := strings.TrimRight(baseURL, "/") + "/api/calendar/event?" + params.Encode()
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("Referer", strings.TrimRight(baseURL, "/")+"/app/calendar")
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	var result map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return false
	}
	data, ok := result["data"].([]any)
	if !ok {
		return false
	}
	for _, d := range data {
		event := d.(map[string]any)
		if event["type"] != "holiday" || event["timeType"] != "allday" {
			continue
		}
		if strings.HasPrefix(event["startTime"].(string), today) {
			return true
		}
	}
	return false
}

func alreadyClockedIn(client *http.Client, baseURL, userID, today string) (bool, error) {
	clockedIn, _, err := attendanceHistory(client, baseURL, userID, today)
	return clockedIn, err
}

func attendanceHistory(client *http.Client, baseURL, userID, today string) (bool, bool, error) {
	url := fmt.Sprintf("%s/api/ehr/timeline/month?baseDate=%s&userId=%s", strings.TrimRight(baseURL, "/"), today, userID)
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("Referer", strings.TrimRight(baseURL, "/")+"/app/ehr")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("timezoneoffset", "540")
	resp, err := client.Do(req)
	if err != nil {
		return false, false, err
	}
	defer resp.Body.Close()
	var result map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return false, false, err
	}
	weekList, ok := result["weekList"].([]any)
	if !ok {
		return false, false, fmt.Errorf("weekList 없음")
	}
	for _, w := range weekList {
		week := w.(map[string]any)
		for _, d := range week["dailyList"].([]any) {
			daily := d.(map[string]any)
			detailDay := daily["detailDay"].(map[string]any)
			if detailDay["day"].(string) != today {
				continue
			}
			return daily["clockInHistory"] != nil, daily["clockOutHistory"] != nil, nil
		}
	}
	return false, false, fmt.Errorf("오늘 데이터 없음")
}

func clockIn(client *http.Client, baseURL string, userID int, now time.Time) error {
	return clockAttendance(client, baseURL, userID, now, "clockIn")
}

func clockOut(client *http.Client, baseURL string, userID int, now time.Time) error {
	return clockAttendance(client, baseURL, userID, now, "clockOut")
}

func clockAttendance(client *http.Client, baseURL string, userID int, now time.Time, action string) error {
	workingDay := now.Format("2006-01-02")
	url := fmt.Sprintf("%s/api/ehr/timeline/status/%s?userId=%d&baseDate=%s", strings.TrimRight(baseURL, "/"), action, userID, workingDay)
	body := map[string]any{"checkTime": now.UTC().Format("2006-01-02T15:04:05.000Z"), "timelineStatus": map[string]any{}, "isNightWork": false, "workingDay": workingDay}
	b, _ := json.Marshal(body)
	req, _ := http.NewRequest("POST", url, bytes.NewBuffer(b))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Referer", strings.TrimRight(baseURL, "/")+"/app/ehr")
	req.Header.Set("timezoneoffset", "540")
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	bodyBytes, _ := io.ReadAll(resp.Body)
	var result map[string]any
	if err := json.Unmarshal(bodyBytes, &result); err == nil {
		if code, ok := result["code"].(float64); ok && int(code) == 200 {
			return nil
		}
		if msg, ok := result["message"].(string); ok {
			return errors.New(msg)
		}
	}
	if resp.StatusCode >= 400 {
		return fmt.Errorf("%s http %d: %s", action, resp.StatusCode, strings.TrimSpace(string(bodyBytes)))
	}
	return nil
}

func formatAttendanceStatus(s AttendanceStatus) string {
	return fmt.Sprintf("근태 상태\n- 사용자: %d\n- 날짜: %s\n- 근무구분: %s\n- 공휴일: %s\n- 출근: %s\n- 퇴근: %s\n",
		s.UserID,
		s.Today,
		s.Leave,
		boolKR(s.Holiday, "예", "아니오"),
		boolKR(s.ClockedIn, "완료", "미처리"),
		boolKR(s.ClockedOut, "완료", "미처리"),
	)
}

func boolKR(v bool, yes, no string) string {
	if v {
		return yes
	}
	return no
}

func formatJSON(v any) string { b, _ := json.MarshalIndent(v, "", "  "); return string(b) }

func saveSessionFromClient(baseURL string, client *http.Client, userID int, username string) error {
	jar, ok := client.Jar.(*cookiejar.Jar)
	if !ok {
		return nil
	}
	u, _ := url.Parse(baseURL)
	cookies := cookiesToSaved(jar.Cookies(u))
	return SaveSession(Session{UserID: userID, UserName: username, BaseURL: baseURL, Cookies: cookies, LastCheck: time.Now().In(kst).Format(time.RFC3339)})
}

func updatedConfig(cfg Config, username, password, baseURL, mailListURL, mailSearchURL, mailDeleteURL string) Config {
	if username != "" {
		cfg.Username = username
	}
	if password != "" {
		cfg.Password = password
	}
	if baseURL != "" {
		cfg.BaseURL = baseURL
	}
	if mailListURL != "" {
		cfg.MailListURL = mailListURL
	}
	if mailSearchURL != "" {
		cfg.MailSearchURL = mailSearchURL
	}
	if mailDeleteURL != "" {
		cfg.MailDeleteURL = mailDeleteURL
	}
	if cfg.BaseURL == "" {
		cfg.BaseURL = defaultBaseURL
	}
	return cfg
}
