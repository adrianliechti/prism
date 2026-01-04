package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"net"
	"os/exec"
	"runtime"

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

	serverPort, err := getFreePort("localhost", *portFlag)

	if err != nil {
		panic(err)
	}

	srv, err := server.New(cfg)

	if err != nil {
		panic(err)
	}

	url := fmt.Sprintf("http://localhost:%d", serverPort)
	addr := fmt.Sprintf("localhost:%d", serverPort)

	if !*serverFlag {
		openBrowser(url)
	}
	fmt.Printf("Prism is running at %s\n", url)

	if err := srv.ListenAndServe(context.Background(), addr); err != nil {
		panic(err)
	}
}

func getFreePort(host string, port int) (int, error) {
	if port > 0 {
		listener, err := net.Listen("tcp", fmt.Sprintf("%s:%d", host, port))

		if err == nil {
			listener.Close()
			return port, nil
		}
	}

	listener, err := net.Listen("tcp", ":0")

	if err != nil {
		return 0, fmt.Errorf("failed to find a free port: %w", err)
	}

	defer listener.Close()

	addr := listener.Addr().(*net.TCPAddr)
	return addr.Port, nil
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
