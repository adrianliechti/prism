package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"net"
	"os/exec"
	"os/signal"
	"runtime"
	"syscall"

	"github.com/adrianliechti/prism/pkg/config"
	"github.com/adrianliechti/prism/pkg/server"
)

func main() {
	portFlag := flag.Int("port", 9999, "port to listen on (0 for random free port)")
	serverFlag := flag.Bool("server", false, "start server without opening browser")

	flag.Parse()

	cfg, err := config.New()

	if err != nil {
		panic(err)
	}

	// Bind the port now and hand the listener to the server to avoid a TOCTOU race.
	listener, err := listen("localhost", *portFlag)

	if err != nil {
		panic(err)
	}

	srv, err := server.New(cfg)

	if err != nil {
		panic(err)
	}

	addr := listener.Addr().(*net.TCPAddr)
	url := fmt.Sprintf("http://localhost:%d", addr.Port)

	if !*serverFlag {
		openBrowser(url)
	}
	fmt.Printf("Prism is running at %s\n", url)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if err := srv.Serve(ctx, listener); err != nil {
		panic(err)
	}
}

// listen binds to the requested port, falling back to a random free port if busy.
func listen(host string, port int) (net.Listener, error) {
	if port > 0 {
		l, err := net.Listen("tcp", fmt.Sprintf("%s:%d", host, port))
		if err == nil {
			return l, nil
		}
	}

	l, err := net.Listen("tcp", fmt.Sprintf("%s:0", host))
	if err != nil {
		return nil, fmt.Errorf("failed to bind a free port: %w", err)
	}
	return l, nil
}

func openBrowser(url string) error {
	switch runtime.GOOS {
	case "darwin":
		cmd := exec.Command("open", url)
		return cmd.Start()

	case "linux":
		cmd := exec.Command("xdg-open", url)
		return cmd.Start()

	case "windows":
		cmd := exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
		return cmd.Start()
	}

	return errors.ErrUnsupported
}

