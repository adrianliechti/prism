package server

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"

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

	mux.HandleFunc("/proxy/grpc/{host}/{path...}", s.handleGRPC)
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

	return &Server{
		Handler: mux,
	}, nil
}

func (s *Server) ListenAndServe(ctx context.Context, addr string) error {
	srv := &http.Server{
		Addr:    addr,
		Handler: s,
	}

	go func() {
		<-ctx.Done()
		srv.Shutdown(context.Background())
	}()

	if err := srv.ListenAndServe(); err != http.ErrServerClosed {
		return err
	}

	return nil
}
