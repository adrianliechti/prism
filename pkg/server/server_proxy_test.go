package server

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/adrianliechti/prism/pkg/config"
)

func testServer(t *testing.T) *Server {
	t.Helper()
	s, err := New(&config.Config{DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func bridgeRequest(t *testing.T, s *Server, upstream, method, path, body string, follow bool) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest("POST", "http://localhost/proxy/http/"+strings.TrimPrefix(upstream, "http://")+path, strings.NewReader(body))
	r.Header.Set("X-Prism-Method", method)
	r.Header.Set("Cache-Control", "no-cache")
	r.Header.Set("Accept-Language", "browser-default")
	r.Header.Set("X-Prism-Redirect", "false")
	if follow {
		r.Header.Set("X-Prism-Redirect", "true")
	}
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	return w
}

func TestHTTPMethodsAndBodies(t *testing.T) {
	s := testServer(t)
	for _, method := range []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"} {
		t.Run(method, func(t *testing.T) {
			var calls atomic.Int32
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				body, _ := io.ReadAll(r.Body)
				if r.Method != method || string(body) != "payload" {
					t.Errorf("upstream got %s %q", r.Method, body)
				}
				if r.Header.Get("X-Prism-Method") != "" {
					t.Error("control header leaked")
				}
				if r.Header.Get("Cache-Control") != "" || r.Header.Get("Accept-Language") != "" {
					t.Error("browser headers leaked")
				}
				w.Header().Set("Allow", "GET, OPTIONS")
				w.WriteHeader(202)
				w.Write([]byte("accepted"))
			}))
			defer upstream.Close()
			w := bridgeRequest(t, s, upstream.URL, method, "/echo", "payload", true)
			if calls.Load() != 1 || w.Code != 200 || w.Header().Get("X-Prism-Status") != "202 Accepted" || w.Body.String() != "accepted" {
				t.Fatalf("unexpected result: calls=%d code=%d headers=%v body=%s", calls.Load(), w.Code, w.Header(), w.Body)
			}
		})
	}
}

func TestRealOPTIONSIsNotPreflight(t *testing.T) {
	s := testServer(t)
	var calls atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1); w.WriteHeader(202) }))
	defer upstream.Close()
	path := "http://localhost/proxy/http/" + strings.TrimPrefix(upstream.URL, "http://") + "/"
	for _, preflight := range []bool{false, true} {
		r := httptest.NewRequest("OPTIONS", path, nil)
		if preflight {
			r.Header.Set("Origin", "http://localhost:5173")
			r.Header.Set("Access-Control-Request-Method", "POST")
		}
		w := httptest.NewRecorder()
		s.ServeHTTP(w, r)
		expected := 202
		if preflight {
			expected = 204
		}
		if w.Code != expected {
			t.Fatalf("preflight=%v code=%d", preflight, w.Code)
		}
	}
	if calls.Load() != 1 {
		t.Fatalf("upstream calls=%d", calls.Load())
	}
}

func TestBodyPreservingRedirects(t *testing.T) {
	s := testServer(t)
	for _, status := range []int{307, 308} {
		for _, follow := range []bool{false, true} {
			var echoed atomic.Int32
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/redirect" {
					http.Redirect(w, r, "/echo", status)
					return
				}
				echoed.Add(1)
				body, _ := io.ReadAll(r.Body)
				if r.Method != "POST" || string(body) != "replay me" {
					t.Errorf("redirect lost method/body: %s %q", r.Method, body)
				}
				w.Write(body)
			}))
			w := bridgeRequest(t, s, upstream.URL, "POST", "/redirect", "replay me", follow)
			upstream.Close()
			if follow && (w.Body.String() != "replay me" || echoed.Load() != 1) {
				t.Fatalf("redirect failed: %d %v %s", w.Code, w.Header(), w.Body)
			}
			if !follow && (echoed.Load() != 0 || w.Code != 200 || !strings.HasPrefix(w.Header().Get("X-Prism-Status"), "30")) {
				t.Fatalf("disabled redirect escaped: %v", w.Header())
			}
		}
	}
}

func TestHEADMetadataDoesNotPromiseABody(t *testing.T) {
	s := testServer(t)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "HEAD" {
			t.Errorf("method=%s", r.Method)
		}
		w.Header().Set("Content-Length", "1234")
	}))
	defer upstream.Close()
	w := bridgeRequest(t, s, upstream.URL, "HEAD", "/", "", true)
	if w.Body.Len() != 0 || w.Header().Get("Content-Length") != "" || w.Header().Get("X-Prism-Content-Length") != "1234" {
		t.Fatalf("bad HEAD: %v %s", w.Header(), w.Body)
	}
}

func TestCookiesStayUpstreamAndAreInspectable(t *testing.T) {
	s := testServer(t)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/login" {
			http.SetCookie(w, &http.Cookie{Name: "session", Value: "test", Path: "/", HttpOnly: true})
			http.SetCookie(w, &http.Cookie{Name: "theme", Value: "dark", Path: "/"})
			return
		}
		w.Write([]byte(r.Header.Get("Cookie")))
	}))
	defer upstream.Close()
	w := bridgeRequest(t, s, upstream.URL, "GET", "/login", "", true)
	if len(w.Header().Values("Set-Cookie")) != 0 {
		t.Fatal("upstream cookies leaked to browser")
	}
	data, err := base64.StdEncoding.DecodeString(w.Header().Get("X-Prism-Set-Cookie"))
	if err != nil {
		t.Fatal(err)
	}
	var cookies []string
	if err := json.Unmarshal(data, &cookies); err != nil || len(cookies) != 2 {
		t.Fatalf("cookies=%s err=%v", data, err)
	}
	w = bridgeRequest(t, s, upstream.URL, "GET", "/echo", "", true)
	if !strings.Contains(w.Body.String(), "session=test") {
		t.Fatalf("session not reused: %s", w.Body)
	}
}
