package prism

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var distFS embed.FS

var DistFS = mustSub(distFS, "dist")

func mustSub(fsys fs.FS, dir string) fs.FS {
	sub, err := fs.Sub(fsys, dir)
	if err != nil {
		panic("prism: failed to open embedded dist/: " + err.Error())
	}
	return sub
}
