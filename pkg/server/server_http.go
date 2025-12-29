package server

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"time"
)

func (s *Server) handleHTTP(w http.ResponseWriter, r *http.Request) {
	var req Request

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	targetURL := req.URL

	if len(req.Query) > 0 {
		parsedURL, err := url.Parse(req.URL)

		if err != nil {
			http.Error(w, "Invalid URL: "+err.Error(), http.StatusBadRequest)
			return
		}

		query := parsedURL.Query()

		for key, value := range req.Query {
			query.Set(key, value)
		}

		parsedURL.RawQuery = query.Encode()
		targetURL = parsedURL.String()
	}

	var bodyReader io.Reader

	if req.Body != "" {
		bodyReader = bytes.NewBufferString(req.Body)
	}

	outReq, err := http.NewRequest(req.Method, targetURL, bodyReader)

	if err != nil {
		http.Error(w, "Failed to create request: "+err.Error(), http.StatusBadRequest)
		return
	}

	for key, value := range req.Headers {
		outReq.Header.Set(key, value)
	}

	client := &http.Client{
		Timeout: 30 * time.Second,
	}

	if req.Options != nil {
		if req.Options.Insecure {
			client.Transport = &http.Transport{
				TLSClientConfig: &tls.Config{
					InsecureSkipVerify: req.Options.Insecure,
				},
			}
		}

		if !req.Options.Redirect {
			client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
				return http.ErrUseLastResponse
			}
		}
	}

	start := time.Now()

	resp, err := client.Do(outReq)

	duration := time.Since(start).Milliseconds()

	if err != nil {
		w.Header().Set("Content-Type", "application/json")

		json.NewEncoder(w).Encode(Response{
			StatusCode: 0,
			Headers:    map[string]string{},
			Body:       "",
			Duration:   duration,
			Error:      err.Error(),
		})

		return
	}

	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)

	if err != nil {
		http.Error(w, "Failed to read response body", http.StatusInternalServerError)
		return
	}

	respHeaders := make(map[string]string)

	for key, values := range resp.Header {
		if len(values) > 0 {
			respHeaders[key] = values[0]
		}
	}

	w.Header().Set("Content-Type", "application/json")

	json.NewEncoder(w).Encode(Response{
		StatusCode: resp.StatusCode,
		Status:     resp.Status,
		Headers:    respHeaders,
		Body:       string(respBody),
		Duration:   duration,
	})
}
