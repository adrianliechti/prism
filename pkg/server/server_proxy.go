package server

import (
	"crypto/tls"
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

// Shared upstream transports; per-request transports leak idle connections.
var (
	proxyTransport = http.DefaultTransport.(*http.Transport).Clone()

	proxyTransportInsecure = func() *http.Transport {
		t := http.DefaultTransport.(*http.Transport).Clone()
		t.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
		return t
	}()
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

// setCORSHeaders makes proxy responses readable when the UI runs on a
// different origin than this server.
func setCORSHeaders(h http.Header) {
	h.Set("Access-Control-Allow-Origin", "*")
	h.Set("Access-Control-Allow-Methods", "*")
	h.Set("Access-Control-Allow-Headers", "*")
	h.Set("Access-Control-Expose-Headers", "*")
}

func (s *Server) handleProxy(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		// CORS preflight (only sent when the UI runs on a different origin)
		setCORSHeaders(w.Header())
		w.WriteHeader(http.StatusNoContent)
		return
	}

	scheme := r.PathValue("scheme")
	host := r.PathValue("host")
	path := r.PathValue("path")

	targetURL, err := url.Parse(scheme + "://" + host)

	if err != nil {
		setCORSHeaders(w.Header())
		http.Error(w, "Invalid target URL: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Fix the request URL to the correct path
	r.URL.Path = "/" + path
	r.URL.RawPath = ""

	// Redirect handling is opt-in via X-Prism-Redirect ("true" = follow
	// server-side, "false" = surface the 3xx). Consumers that don't send the
	// header (OpenAI panel, chat adapter) get redirects passed through as-is.
	redirectMode := r.Header.Get("X-Prism-Redirect")

	transport := proxyTransport
	if r.Header.Get("X-Prism-Insecure") == "true" {
		transport = proxyTransportInsecure
	}

	var rt http.RoundTripper = transport
	if redirectMode == "true" {
		rt = &redirectTransport{base: transport}
	}

	proxy := &httputil.ReverseProxy{
		Transport: rt,

		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.SetURL(targetURL)
			pr.Out.Host = targetURL.Host

			// Strip proxy control headers and browser fetch artifacts the
			// target was never meant to see.
			pr.Out.Header.Del("X-Prism-Insecure")
			pr.Out.Header.Del("X-Prism-Redirect")
			pr.Out.Header.Del("Origin")
			pr.Out.Header.Del("Referer")
			pr.Out.Header.Del("Cookie")
			for key := range pr.Out.Header {
				if strings.HasPrefix(key, "Sec-") {
					pr.Out.Header.Del(key)
				}
			}

			// Unwrap headers the browser refuses to send directly
			// (Cookie, Host, Origin, ...): the UI smuggles them as
			// X-Prism-Header-<Name>.
			for key, values := range pr.In.Header {
				name, ok := strings.CutPrefix(key, "X-Prism-Header-")
				if !ok || name == "" {
					continue
				}
				pr.Out.Header.Del(key)
				if strings.EqualFold(name, "Host") {
					pr.Out.Host = values[len(values)-1]
					continue
				}
				pr.Out.Header.Del(name)
				for _, v := range values {
					pr.Out.Header.Add(name, v)
				}
			}
		},

		ModifyResponse: func(resp *http.Response) error {
			// Never let the upstream spoof our control header.
			resp.Header.Del("X-Prism-Status")

			// With redirect-following explicitly off, mask 3xx statuses so
			// the browser fetch in the UI reports them instead of following
			// Location itself; the UI restores the code from X-Prism-Status.
			if redirectMode == "false" && resp.Header.Get("Location") != "" {
				switch resp.StatusCode {
				case http.StatusMovedPermanently, http.StatusFound, http.StatusSeeOther,
					http.StatusTemporaryRedirect, http.StatusPermanentRedirect:
					resp.Header.Set("X-Prism-Status", resp.Status)
					resp.StatusCode = http.StatusOK
					resp.Status = "200 OK"
				}
			}

			// Upstream CORS headers must not reach the browser (they would
			// conflict with ours), but the UI still wants to display them:
			// move them aside under X-Prism-Upstream-<Name>.
			for key, values := range resp.Header {
				if !strings.HasPrefix(key, "Access-Control-") {
					continue
				}
				resp.Header.Del(key)
				for _, v := range values {
					resp.Header.Add("X-Prism-Upstream-"+key, v)
				}
			}
			setCORSHeaders(resp.Header)
			return nil
		},

		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			// ModifyResponse never runs on transport errors; without CORS
			// headers a cross-origin UI can't read the error text.
			setCORSHeaders(w.Header())
			http.Error(w, fmt.Sprintf("proxy error: %v", err), http.StatusBadGateway)
		},
	}

	proxy.ServeHTTP(w, r)
}
