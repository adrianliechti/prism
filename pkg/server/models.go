package server

type Request struct {
	Method string `json:"method,omitempty"`
	URL    string `json:"url,omitempty"`

	Query   map[string]string `json:"query,omitempty"`
	Headers map[string]string `json:"headers,omitempty"`

	Body string `json:"body,omitempty"`

	Options *RequestOptions `json:"options,omitempty"`
}

type RequestOptions struct {
	Insecure bool `json:"insecure,omitempty"`
	Redirect bool `json:"redirect,omitempty"`
}

type Response struct {
	Status     string `json:"status,omitempty"`
	StatusCode int    `json:"statusCode,omitempty"`

	Headers map[string]string `json:"headers,omitempty"`

	Body string `json:"body,omitempty"`

	Duration int64 `json:"duration,omitempty"`
}
