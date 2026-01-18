package config

import (
	"flag"
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	ListenAddress        string
	ListenPort           int
	OBSWebSocketURL      string
	OBSWebSocketPassword string
	CloudflareWorkerURL  string
	AuthToken            string
	LogLevel             string
}

const (
	DefaultListenAddress   = "0.0.0.0"
	DefaultListenPort      = 4456
	DefaultOBSWebSocketURL = "ws://127.0.0.1:4455"
	DefaultLogLevel        = "info"
)

func Load() (*Config, error) {
	cfg := &Config{
		ListenAddress:       DefaultListenAddress,
		ListenPort:          DefaultListenPort,
		OBSWebSocketURL:     DefaultOBSWebSocketURL,
		LogLevel:            DefaultLogLevel,
		CloudflareWorkerURL: "",
		AuthToken:           "",
	}

	flag.StringVar(&cfg.ListenAddress, "listen", DefaultListenAddress, "Address to listen on")
	flag.IntVar(&cfg.ListenPort, "port", DefaultListenPort, "Port to listen on")
	flag.StringVar(&cfg.OBSWebSocketURL, "obs-url", DefaultOBSWebSocketURL, "OBS WebSocket URL")
	flag.StringVar(&cfg.OBSWebSocketPassword, "obs-password", "", "OBS WebSocket password")
	flag.StringVar(&cfg.CloudflareWorkerURL, "worker-url", "", "Cloudflare Worker URL for remote access")
	flag.StringVar(&cfg.AuthToken, "auth-token", "", "Authentication token for client connections")
	flag.StringVar(&cfg.LogLevel, "log-level", DefaultLogLevel, "Log level (debug, info, warn, error)")

	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "DockForLife OBS Proxy\n\n")
		fmt.Fprintf(os.Stderr, "Usage: %s [options]\n\n", os.Args[0])
		fmt.Fprintf(os.Stderr, "Options:\n")
		flag.PrintDefaults()
		fmt.Fprintf(os.Stderr, "\nEnvironment variables:\n")
		fmt.Fprintf(os.Stderr, "  DFL_PROXY_LISTEN      Listen address (default: %s)\n", DefaultListenAddress)
		fmt.Fprintf(os.Stderr, "  DFL_PROXY_PORT        Listen port (default: %d)\n", DefaultListenPort)
		fmt.Fprintf(os.Stderr, "  DFL_PROXY_OBS_URL     OBS WebSocket URL (default: %s)\n", DefaultOBSWebSocketURL)
		fmt.Fprintf(os.Stderr, "  DFL_PROXY_OBS_PASSWORD OBS WebSocket password\n")
		fmt.Fprintf(os.Stderr, "  DFL_PROXY_WORKER_URL  Cloudflare Worker URL\n")
		fmt.Fprintf(os.Stderr, "  DFL_PROXY_AUTH_TOKEN  Authentication token\n")
		fmt.Fprintf(os.Stderr, "  DFL_PROXY_LOG_LEVEL   Log level (default: %s)\n", DefaultLogLevel)
	}

	flag.Parse()

	if err := loadEnvOverrides(cfg); err != nil {
		return nil, err
	}

	return cfg, nil
}

func loadEnvOverrides(cfg *Config) error {
	if v := os.Getenv("DFL_PROXY_LISTEN"); v != "" {
		cfg.ListenAddress = v
	}
	if v := os.Getenv("DFL_PROXY_PORT"); v != "" {
		port, err := strconv.Atoi(v)
		if err != nil {
			return fmt.Errorf("invalid DFL_PROXY_PORT: %w", err)
		}
		cfg.ListenPort = port
	}
	if v := os.Getenv("DFL_PROXY_OBS_URL"); v != "" {
		cfg.OBSWebSocketURL = v
	}
	if v := os.Getenv("DFL_PROXY_OBS_PASSWORD"); v != "" {
		cfg.OBSWebSocketPassword = v
	}
	if v := os.Getenv("DFL_PROXY_WORKER_URL"); v != "" {
		cfg.CloudflareWorkerURL = v
	}
	if v := os.Getenv("DFL_PROXY_AUTH_TOKEN"); v != "" {
		cfg.AuthToken = v
	}
	if v := os.Getenv("DFL_PROXY_LOG_LEVEL"); v != "" {
		cfg.LogLevel = strings.ToLower(v)
	}

	return nil
}

func (c *Config) ListenAddr() string {
	return fmt.Sprintf("%s:%d", c.ListenAddress, c.ListenPort)
}
