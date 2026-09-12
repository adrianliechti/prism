package server

import (
	"bytes"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
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
	base   http.RoundTripper
	jar    http.CookieJar
	follow bool
}

func (t *redirectTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	clientReq := req.Clone(req.Context())
	clientReq.RequestURI = ""

	client := &http.Client{Transport: t.base, Jar: t.jar}
	if !t.follow {
		client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	}
	// An explicit Cookie header takes precedence over automatic session cookies.
	if clientReq.Header.Get("Cookie") != "" {
		client.Jar = nil
	}
	return client.Do(clientReq)
}

// rawProxyPath returns the still-encoded target path from the incoming
// escaped request path, stripping the fixed /proxy/{scheme}/{host}/ prefix.
// Splitting on "/" preserves encoded separators (%2F) inside the remaining
// segments, which PathValue would otherwise have decoded away. ok is false
// when the path has fewer segments than the route guarantees.
func rawProxyPath(escapedPath string) (string, bool) {
	segments := strings.Split(strings.TrimPrefix(escapedPath, "/"), "/")
	if len(segments) < 3 {
		return "", false
	}
	return "/" + strings.Join(segments[3:], "/"), true
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
	if r.Method == http.MethodOptions && r.Header.Get("Origin") != "" && r.Header.Get("Access-Control-Request-Method") != "" {
		// CORS preflight (only sent when the UI runs on a different origin)
		setCORSHeaders(w.Header())
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// The browser sends a POST envelope, while Go executes the user's method.
	// This also permits GET/HEAD bodies and avoids confusing OPTIONS with CORS.
	method := r.Header.Get("X-Prism-Method")
	bridge := method != ""
	if bridge {
		if r.Method != http.MethodPost {
			http.Error(w, "request bridge requires POST", http.StatusBadRequest)
			return
		}
		switch method {
		case "GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS":
		default:
			http.Error(w, "unsupported HTTP method", http.StatusBadRequest)
			return
		}
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
	if (scheme != "http" && scheme != "https") || targetURL.Host == "" {
		http.Error(w, "target must use HTTP or HTTPS", http.StatusBadRequest)
		return
	}

	// Point the request at the target path. PathValue decodes the wildcard, so
	// derive RawPath from the still-encoded suffix (captured before Path is
	// overwritten) to keep percent-encoding intact — e.g. %2F must not collapse
	// into a path separator for the upstream.
	rawSuffix, ok := rawProxyPath(r.URL.EscapedPath())
	r.URL.Path = "/" + path
	if ok && rawSuffix != r.URL.Path {
		r.URL.RawPath = rawSuffix
	} else {
		r.URL.RawPath = ""
	}

	// Redirect handling is opt-in via X-Prism-Redirect ("true" = follow
	// server-side, "false" = surface the 3xx). Unfollowed redirects are masked
	// in the response so the browser never follows a Location outside the proxy.
	redirectMode := r.Header.Get("X-Prism-Redirect")
	if redirectMode == "true" && r.Body != nil {
		// 307/308 require a replayable body. Bound the buffer and return an
		// explicit error rather than silently falling back to browser redirects.
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 64<<20))
		r.Body.Close()
		if err != nil {
			http.Error(w, "request body exceeds the 64 MiB redirect limit", http.StatusRequestEntityTooLarge)
			return
		}
		r.GetBody = func() (io.ReadCloser, error) { return io.NopCloser(bytes.NewReader(body)), nil }
		r.Body, _ = r.GetBody()
		r.ContentLength = int64(len(body))
	}

	transport := proxyTransport
	if r.Header.Get("X-Prism-Insecure") == "true" {
		transport = proxyTransportInsecure
	}

	var rt http.RoundTripper = &redirectTransport{base: transport, jar: s.cookies, follow: redirectMode == "true"}

	proxy := &httputil.ReverseProxy{
		Transport: rt,

		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.SetURL(targetURL)
			pr.Out.Host = targetURL.Host
			if bridge {
				pr.Out.Method = method
				// Only the browser-generated multipart boundary belongs to the
				// payload. Cache mode, language and other browser defaults must
				// not silently become headers of the request being tested.
				contentType := pr.Out.Header.Get("Content-Type")
				pr.Out.Header = make(http.Header)
				if contentType != "" {
					pr.Out.Header.Set("Content-Type", contentType)
				}
			}

			// Strip proxy control headers and browser fetch artifacts the
			// target was never meant to see.
			pr.Out.Header.Del("X-Prism-Insecure")
			pr.Out.Header.Del("X-Prism-Redirect")
			pr.Out.Header.Del("X-Prism-Method")
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
			resp.Header.Del("X-Prism-Set-Cookie")
			resp.Header.Del("X-Prism-Content-Length")
			if cookies := resp.Header.Values("Set-Cookie"); len(cookies) > 0 {
				data, _ := json.Marshal(cookies)
				resp.Header.Set("X-Prism-Set-Cookie", base64.StdEncoding.EncodeToString(data))
				resp.Header.Del("Set-Cookie")
			}
			if bridge && method == "HEAD" {
				if length := resp.Header.Get("Content-Length"); length != "" {
					resp.Header.Set("X-Prism-Content-Length", length)
				}
				resp.Header.Del("Content-Length")
				resp.ContentLength = 0
			}

			// With redirect-following explicitly off, mask 3xx statuses so
			// the browser fetch in the UI reports them instead of following
			// Location itself; the UI restores the code from X-Prism-Status.
			if resp.Header.Get("Location") != "" {
				switch resp.StatusCode {
				case http.StatusMovedPermanently, http.StatusFound, http.StatusSeeOther,
					http.StatusTemporaryRedirect, http.StatusPermanentRedirect:
					resp.Header.Set("X-Prism-Status", resp.Status)
					resp.StatusCode = http.StatusOK
					resp.Status = "200 OK"
				}
			}
			// Preserve upstream status for the HTTP editor without browser cache
			// handling (304) or body restrictions (HEAD/204) changing the result.
			if bridge && resp.Header.Get("X-Prism-Status") == "" {
				resp.Header.Set("X-Prism-Status", resp.Status)
				resp.StatusCode = http.StatusOK
				resp.Status = "200 OK"
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
