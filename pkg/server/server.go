package server

import (
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

type Server struct {
	http.Handler
}

func New() *Server {
	mux := http.NewServeMux()

	s := &Server{
		Handler: mux,
	}

	mux.HandleFunc("/proxy/{scheme}/{host}/{path...}", s.handleProxy)

	openaiTarget, _ := url.Parse("http://localhost:8080/v1")
	openaiToken := ""

	proxy := &httputil.ReverseProxy{
		ErrorLog: log.New(io.Discard, "", 0),

		Rewrite: func(r *httputil.ProxyRequest) {
			r.Out.URL.Path = strings.TrimPrefix(r.Out.URL.Path, "/openai/v1")

			r.SetURL(openaiTarget)

			if openaiToken != "" {
				r.Out.Header.Set("Authorization", "Bearer "+openaiToken)
			}

			r.Out.Host = openaiTarget.Host
		},
	}

	mux.Handle("/openai/v1/", proxy)

	return &Server{
		Handler: mux,
	}
}

func (s *Server) ListenAndServe(addr string) error {
	srv := http.Server{
		Addr:    addr,
		Handler: s,
	}

	return srv.ListenAndServe()
}
