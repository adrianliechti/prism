package server

import (
	"net/http"
)

type Server struct {
	http.Handler
}

func New() *Server {
	mux := http.NewServeMux()

	s := &Server{
		Handler: mux,
	}

	mux.HandleFunc("POST /api/http/execute", s.handleHTTP)

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
