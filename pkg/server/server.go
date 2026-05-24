package server

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"

	"github.com/adrianliechti/prism"
	"github.com/adrianliechti/prism/pkg/config"
)

type Server struct {
	http.Handler
}

func New(cfg *config.Config) (*Server, error) {
	mux := http.NewServeMux()

	s := &Server{
		Handler: mux,
	}

	mux.HandleFunc("/proxy/grpc/{scheme}/{host}/{path...}", s.handleGRPC)
	mux.HandleFunc("/proxy/mcp/{scheme}/{host}/features", s.handleMcpListFeatures)
	mux.HandleFunc("/proxy/mcp/{scheme}/{host}/tool/call", s.handleMcpCallTool)
	mux.HandleFunc("/proxy/mcp/{scheme}/{host}/resource/call", s.handleMcpReadResource)
	mux.HandleFunc("/proxy/{scheme}/{host}/{path...}", s.handleProxy)

	mux.HandleFunc("GET /data/{store}", s.handleDataList)
	mux.HandleFunc("GET /data/{store}/{id}", s.handleDataGet)
	mux.HandleFunc("PUT /data/{store}/{id}", s.handleDataPut)
	mux.HandleFunc("DELETE /data/{store}/{id}", s.handleDataDelete)

	if cfg.OpenAI != nil {
		target, err := url.Parse(cfg.OpenAI.URL)

		if err != nil {
			return nil, err
		}

		proxy := &httputil.ReverseProxy{
			ErrorLog: log.New(io.Discard, "", 0),

			Rewrite: func(r *httputil.ProxyRequest) {
				r.Out.URL.Path = strings.TrimPrefix(r.Out.URL.Path, "/openai/v1")

				r.SetURL(target)

				if cfg.OpenAI.Token != "" {
					r.Out.Header.Set("Authorization", "Bearer "+cfg.OpenAI.Token)
				}

				r.Out.Host = target.Host
			},
		}

		mux.Handle("/openai/v1/", proxy)
	}

	mux.HandleFunc("GET /config.json", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		config := &Config{}

		if cfg.OpenAI != nil {
			config.AI = &AIConfig{
				Model: cfg.OpenAI.Model,
			}
		}

		json.NewEncoder(w).Encode(config)
	})

	mux.Handle("/", http.FileServerFS(prism.DistFS))

	return s, nil
}

func (s *Server) ListenAndServe(ctx context.Context, addr string) error {
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	return s.Serve(ctx, listener)
}

// Serve runs until ctx is cancelled, then shuts down gracefully with a timeout.
func (s *Server) Serve(ctx context.Context, listener net.Listener) error {
	srv := &http.Server{
		Handler: s,
	}

	serverErr := make(chan error, 1)
	go func() {
		if err := srv.Serve(listener); err != nil && err != http.ErrServerClosed {
			serverErr <- err
			return
		}
		serverErr <- nil
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			return err
		}
		return nil
	case err := <-serverErr:
		return err
	}
}
