package server

import (
	"crypto/tls"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
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

func (s *Server) handleProxy(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		// CORS preflight (only sent when the UI runs on a different origin)
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "*")
		w.Header().Set("Access-Control-Allow-Headers", "*")
		w.Header().Set("Access-Control-Expose-Headers", "*")
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

	transport := proxyTransport
	if r.Header.Get("X-Prism-Insecure") == "true" {
		transport = proxyTransportInsecure
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
			// With redirect-following off, mask 3xx statuses so the browser
			// fetch in the UI reports them instead of following Location
			// itself; the UI restores the code from X-Prism-Status.
			if !followRedirect && resp.Header.Get("Location") != "" {
				switch resp.StatusCode {
				case http.StatusMovedPermanently, http.StatusFound, http.StatusSeeOther,
					http.StatusTemporaryRedirect, http.StatusPermanentRedirect:
					resp.Header.Set("X-Prism-Status", strconv.Itoa(resp.StatusCode))
					resp.StatusCode = http.StatusOK
					resp.Status = "200 OK"
				}
			}

			// Add CORS headers only when the upstream didn't set its own, so
			// they never duplicate (browsers reject doubled values).
			if resp.Header.Get("Access-Control-Allow-Origin") == "" {
				resp.Header.Set("Access-Control-Allow-Origin", "*")
			}
			if resp.Header.Get("Access-Control-Expose-Headers") == "" {
				resp.Header.Set("Access-Control-Expose-Headers", "*")
			}
			return nil
		},
	}

	proxy.ServeHTTP(w, r)
}
