// A local fixture server backed by the real Prism handlers and an isolated,
// encrypted data directory. It never opens a user's workspace or credentials.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/adrianliechti/prism/pkg/config"
	"github.com/adrianliechti/prism/pkg/server"
)

func main() {
	dataDir, err := os.MkdirTemp("", "prism-browser-test-")
	if err != nil {
		panic(err)
	}
	defer os.RemoveAll(dataDir)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/stream":
			w.Header().Set("Content-Type", "text/event-stream")
			fmt.Fprint(w, "data: {\"event\":\"first\"}\n\n")
			w.(http.Flusher).Flush()
			<-r.Context().Done()
			return
		case "/slow":
			select {
			case <-time.After(10 * time.Second):
			case <-r.Context().Done():
				return
			}
		case "/redirect307":
			http.Redirect(w, r, "/echo", 307)
			return
		case "/redirect308":
			http.Redirect(w, r, "/echo", 308)
			return
		case "/cookies":
			http.SetCookie(w, &http.Cookie{Name: "session", Value: "synthetic-session", Path: "/", HttpOnly: true})
		case "/options":
			w.Header().Set("Allow", "GET, POST, OPTIONS")
			w.WriteHeader(202)
			return
		}
		body, _ := io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"method": r.Method, "url": r.URL.String(), "body": string(body), "headers": r.Header})
	}))
	defer upstream.Close()
	app, err := server.New(&config.Config{DataDir: dataDir})
	if err != nil {
		panic(err)
	}
	listener, err := net.Listen("tcp", "127.0.0.1:9998")
	if err != nil {
		panic(err)
	}
	proxy := &server.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/test-config" {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{"upstream": upstream.URL})
			return
		}
		app.ServeHTTP(w, r)
	})}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	fmt.Println("Prism browser fixture: http://127.0.0.1:9998")
	if err := proxy.Serve(ctx, listener); err != nil {
		panic(err)
	}
}
