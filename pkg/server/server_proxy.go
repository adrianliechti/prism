package server

import (
	"crypto/tls"
	"net/http"
	"net/http/httputil"
	"net/url"
)

func (s *Server) handleProxy(w http.ResponseWriter, r *http.Request) {
	println(r.URL.String())

	// CORS headers - allow everything
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "*")
	w.Header().Set("Access-Control-Allow-Headers", "*")
	w.Header().Set("Access-Control-Expose-Headers", "*")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	scheme := r.PathValue("scheme")
	host := r.PathValue("host")
	path := r.PathValue("path")

	targetURL, err := url.Parse(scheme + "://" + host)

	if err != nil {
		http.Error(w, "Invalid target URL: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Fix the request URL to the correct path
	r.URL.Path = "/" + path
	r.URL.RawPath = ""

	println(targetURL.String(), r.URL.String())

	transport := &http.Transport{}

	if r.Header.Get("X-Prism-Insecure") == "true" {
		transport.TLSClientConfig = &tls.Config{
			InsecureSkipVerify: true,
		}
	}

	proxy := &httputil.ReverseProxy{
		Transport: transport,

		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.SetURL(targetURL)
			pr.Out.Host = targetURL.Host

			pr.Out.Header.Del("X-Prism-Insecure")
			pr.Out.Header.Del("X-Prism-Redirect")
		},
	}

	proxy.ServeHTTP(w, r)
}
