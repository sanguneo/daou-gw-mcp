package daou

import (
	"strings"
	"testing"
)

func TestFormatMailOutputPrettySearch(t *testing.T) {
	raw := `{
		"endpoint":"https://gw.aegisep.com/api/mail/message/list",
		"status":200,
		"data":{"code":"200","message":"OK","data":{
			"folderName":"받은메일함",
			"folderFullName":"Inbox",
			"total":2,
			"unreadMessageCount":1,
			"currentPage":1,
			"messageList":[{"id":10200,"fromToSimple":"개발3파트 AWS","subject":"ALARM: sample","dateUtc":"2026-04-29T06:07:56.000Z","seen":false,"size":"5.9KB"}]
		}}
	}`
	got := formatMailOutput(raw, "search")
	for _, want := range []string{"메일 검색 결과", "폴더: 받은메일함", "전체: 2건", "안읽음: 1건", "[안읽음] ALARM: sample", "보낸사람: 개발3파트 AWS", "ID: 10200"} {
		if !strings.Contains(got, want) {
			t.Fatalf("expected %q in output, got %q", want, got)
		}
	}
	if strings.Contains(got, "\"messageList\"") || strings.Contains(got, "{") {
		t.Fatalf("expected non-json output, got %q", got)
	}
}

func TestFormatMailOutputRespectsDisplayLimit(t *testing.T) {
	raw := `{
		"data":{"data":{
			"folderName":"받은메일함",
			"total":3,
			"currentPage":1,
			"messageList":[
				{"id":1,"fromToSimple":"A","subject":"one","seen":false},
				{"id":2,"fromToSimple":"B","subject":"two","seen":false},
				{"id":3,"fromToSimple":"C","subject":"three","seen":false}
			]
		}}
	}`
	got := formatMailOutput(raw, "search", 1)
	if strings.Count(got, "\n1. ") != 1 || strings.Contains(got, "\n2. ") || strings.Contains(got, "two") {
		t.Fatalf("expected one displayed mail, got %q", got)
	}
	if !strings.Contains(got, "2건 더 있음") {
		t.Fatalf("expected remaining count hint, got %q", got)
	}
}

func TestFormatApprovalOutputPrettyListAndCount(t *testing.T) {
	listRaw := `{"code":"200","message":"OK","data":[],"page":{"page":0,"offset":3,"total":0,"totalPage":0},"hasNext":false}`
	listGot := formatApprovalOutput(listRaw, "todo")
	for _, want := range []string{"전자결재 목록", "전체: 0건", "문서 없음"} {
		if !strings.Contains(listGot, want) {
			t.Fatalf("expected %q in list output, got %q", want, listGot)
		}
	}
	countRaw := `{"code":"200","message":"OK","data":{"docCount":0,"readable":true}}`
	countGot := formatApprovalOutput(countRaw, "count")
	for _, want := range []string{"전자결재 카운트", "문서: 0건", "열람 가능: 예"} {
		if !strings.Contains(countGot, want) {
			t.Fatalf("expected %q in count output, got %q", want, countGot)
		}
	}
}

func TestFormatConfigOutputPretty(t *testing.T) {
	got := formatConfig(Config{BaseURL: "https://gw.aegisep.com", Username: "sknah", Password: "secret"})
	for _, want := range []string{"Daou GW 설정", "Base URL: https://gw.aegisep.com", "Username: sknah", "Password: 저장됨"} {
		if !strings.Contains(got, want) {
			t.Fatalf("expected %q in output, got %q", want, got)
		}
	}
	if strings.Contains(got, "secret") || strings.Contains(got, "{") {
		t.Fatalf("expected masked non-json output, got %q", got)
	}
}
