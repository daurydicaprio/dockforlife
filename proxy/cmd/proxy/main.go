package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/daury/dockforlife-proxy/internal/adapter"
	"github.com/daury/dockforlife-proxy/internal/config"
	"github.com/daury/dockforlife-proxy/internal/server"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("[PHASE3] DockForLife OBS Proxy starting...")

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("[PHASE3] Failed to load configuration: %v", err)
	}

	log.Printf("[PHASE3] Configuration loaded:")
	log.Printf("[PHASE3]   Listen: %s", cfg.ListenAddr())
	log.Printf("[PHASE3]   OBS URL: %s", cfg.OBSWebSocketURL)
	log.Printf("[PHASE3]   Log level: %s", cfg.LogLevel)

	obsAdapter, err := adapter.NewOBSAdapter(cfg.OBSWebSocketURL, cfg.OBSWebSocketPassword)
	if err != nil {
		log.Fatalf("[PHASE3] Failed to connect to OBS: %v", err)
	}
	defer obsAdapter.Close()

	proxyServer := server.NewServer(cfg, obsAdapter)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Println("[PHASE3] Shutting down...")
		proxyServer.Shutdown()
		cancel()
	}()

	log.Println("[PHASE3] Proxy server ready")
	if err := proxyServer.Start(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("[PHASE3] Server error: %v", err)
	}

	<-ctx.Done()
	log.Println("[PHASE3] Proxy stopped")
}
