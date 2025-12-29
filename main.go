package main

import (
	"prism/pkg/server"
)

func main() {
	srv := server.New()

	if err := srv.ListenAndServe(":9999"); err != nil {
		panic(err)
	}
}
