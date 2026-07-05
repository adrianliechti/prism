package main

import (
	"log"
	"os"

	"github.com/adrianliechti/prism/pkg/config"
	"github.com/adrianliechti/prism/pkg/server"

	shell "github.com/adrianliechti/go-shell"
)

func main() {
	cfg, err := config.New()

	if err != nil {
		log.Fatal(err)
	}

	srv, err := server.New(cfg)

	if err != nil {
		log.Fatal(err)
	}

	err = shell.Run(shell.Options{
		Title:   "Prism",
		Handler: srv,

		Width:  1200,
		Height: 675,

		MinWidth:  640,
		MinHeight: 400,

		Debug: os.Getenv("PRISM_DEBUG") != "",
	})

	if err != nil {
		log.Fatal(err)
	}
}
