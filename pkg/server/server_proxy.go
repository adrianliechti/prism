package server

import (
	"crypto/tls"
	"net/http"
	"net/http/httputil"
	"net/url"
)

// redirectTransport wraps a RoundTripper to follow redirects server-side.
type redirectTransport struct {
	base http.RoundTripper
}

func (t *redirectTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	clientReq := req.Clone(req.Context())
	clientReq.RequestURI = ""

	client := &http.Client{Transport: t.base}
	return client.Do(clientReq)
}

func (s *Server) handleProxy(w http.ResponseWriter, r *http.Request) {
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

	followRedirect := r.Header.Get("X-Prism-Redirect") == "true"

	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
	}

	if r.Header.Get("X-Prism-Insecure") == "true" {
		transport.TLSClientConfig = &tls.Config{
			InsecureSkipVerify: true,
		}
	}

	var rt http.RoundTripper = transport
	if followRedirect {
		rt = &redirectTransport{base: transport}
	}

	proxy := &httputil.ReverseProxy{
		Transport: rt,

		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.SetURL(targetURL)
			pr.Out.Host = targetURL.Host

			pr.Out.Header.Del("X-Prism-Insecure")
			pr.Out.Header.Del("X-Prism-Redirect")
		},
	}

	proxy.ServeHTTP(w, r)
}
