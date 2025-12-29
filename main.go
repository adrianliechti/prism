package main

import "net/http"

func main() {
	mux := http.NewServeMux()

	srv := http.Server{
		Addr: ":8080",

		Handler: mux,
	}

	if err := srv.ListenAndServe(); err != nil {
		panic(err)
	}
}
