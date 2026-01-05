package main

import (
	"net/http"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"

	"github.com/adrianliechti/prism"
	"github.com/adrianliechti/prism/pkg/config"
	"github.com/adrianliechti/prism/pkg/server"
)

func main() {
	cfg, err := config.New()

	if err != nil {
		panic(err)
	}

	mux, err := server.New(cfg)

	if err != nil {
		panic(err)
	}

	options := &options.App{
		Title: "Prism",

		Width:  1200,
		Height: 675,

		AssetServer: &assetserver.Options{
			Assets: prism.DistFS,

			Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				println("Request for:", r.URL.Path)

				mux.ServeHTTP(w, r)
			}),
		},
	}

	if err := wails.Run(options); err != nil {
		panic(err)
	}
}
