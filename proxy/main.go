package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
)

type Config struct {
	OBSURL      string
	OBSPassword string
	WorkerURL   string
	JoinCode    string
	ListenAddr  string
	LogLevel    string
}

type Agent struct {
	cfg        Config
	obsConn    *websocket.Conn
	workerConn *websocket.Conn
	ctx        context.Context
	cancel     context.CancelFunc
	mu         sync.Mutex
	connected  bool
}

func NewAgent(cfg Config) (*Agent, error) {
	if cfg.ListenAddr == "" {
		cfg.ListenAddr = "127.0.0.1:4456"
	}
	if cfg.OBSURL == "" {
		cfg.OBSURL = "ws://127.0.0.1:4455"
	}

	ctx, cancel := context.WithCancel(context.Background())

	return &Agent{
		cfg:    cfg,
		ctx:    ctx,
		cancel: cancel,
	}, nil
}

func (a *Agent) Start() error {
	log.Printf("[Agent] Starting...")
	log.Printf("[Agent] OBS URL: %s", a.cfg.OBSURL)

	var err error
	a.obsConn, _, err = websocket.DefaultDialer.Dial(a.cfg.OBSURL, nil)
	if err != nil {
		return fmt.Errorf("failed to connect to OBS: %w", err)
	}

	a.connected = true
	log.Printf("[Agent] Connected to OBS")

	go a.handleOBSMessages()

	if a.cfg.WorkerURL != "" && a.cfg.JoinCode != "" {
		if err := a.connectToWorker(); err != nil {
			log.Printf("[Agent] Worker connection failed: %v (continuing without remote)", err)
		}
	}

	go a.handleShutdown()

	return nil
}

func (a *Agent) connectToWorker() error {
	workerURL := a.cfg.WorkerURL

	if workerURL == "" {
		return fmt.Errorf("worker URL not configured")
	}

	if !strings.HasPrefix(workerURL, "wss://") && !strings.HasPrefix(workerURL, "https://") {
		workerURL = "wss://" + workerURL
	}

	fullURL := fmt.Sprintf("%s/ws?code=%s&type=host", workerURL, a.cfg.JoinCode)
	log.Printf("[Agent] Connecting to worker: %s", fullURL)

	conn, _, err := websocket.DefaultDialer.Dial(fullURL, nil)
	if err != nil {
		return fmt.Errorf("failed to connect to worker: %w (URL: %s)", err, fullURL)
	}

	a.workerConn = conn
	log.Printf("[Agent] Connected to Cloudflare Worker")

	registerMsg := map[string]interface{}{
		"type":     "register",
		"joinCode": a.cfg.JoinCode,
	}
	if err := conn.WriteJSON(registerMsg); err != nil {
		return fmt.Errorf("failed to register: %w", err)
	}

	go a.handleWorkerMessages()

	return nil
}

func (a *Agent) Stop() {
	a.mu.Lock()
	defer a.mu.Unlock()

	a.cancel()

	if a.obsConn != nil {
		a.obsConn.Close()
	}
	if a.workerConn != nil {
		a.workerConn.Close()
	}

	a.connected = false
	log.Println("[Agent] Stopped")
}

func (a *Agent) handleOBSMessages() {
	for {
		select {
		case <-a.ctx.Done():
			return
		default:
			_, message, err := a.obsConn.ReadMessage()
			if err != nil {
				log.Printf("[Agent] OBS read error: %v", err)
				return
			}

			var obsEvent map[string]interface{}
			if err := json.Unmarshal(message, &obsEvent); err != nil {
				continue
			}

			log.Printf("[Agent] OBS Event: %v", obsEvent)

			if a.workerConn != nil {
				workerMsg := map[string]interface{}{
					"type":      "obs_event",
					"joinCode":  a.cfg.JoinCode,
					"eventData": obsEvent,
				}
				a.workerConn.WriteJSON(workerMsg)
			}
		}
	}
}

func (a *Agent) handleWorkerMessages() {
	for {
		select {
		case <-a.ctx.Done():
			return
		default:
			_, message, err := a.workerConn.ReadMessage()
			if err != nil {
				log.Printf("[Agent] Worker read error: %v", err)
				return
			}

			var workerMsg map[string]interface{}
			if err := json.Unmarshal(message, &workerMsg); err != nil {
				continue
			}

			log.Printf("[Agent] Worker Message: %v", workerMsg)

			msgType, ok := workerMsg["type"].(string)
			if !ok {
				continue
			}

			switch msgType {
			case "command":
				method, _ := workerMsg["method"].(string)
				params, _ := workerMsg["params"].(map[string]interface{})
				if method != "" {
					a.SendCommand(method, params)
				}
			}
		}
	}
}

func (a *Agent) handleShutdown() {
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	select {
	case <-sigChan:
		a.Stop()
	case <-a.ctx.Done():
	}
}

func (a *Agent) SendCommand(method string, params map[string]interface{}) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if !a.connected {
		return fmt.Errorf("not connected to OBS")
	}

	req := map[string]interface{}{
		"requestType": method,
		"requestId":   generateRequestID(),
		"requestData": params,
	}

	if err := a.obsConn.WriteJSON(req); err != nil {
		return fmt.Errorf("failed to send command: %w", err)
	}

	log.Printf("[Agent] Sent command: %s", method)
	return nil
}

func generateRequestID() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}

func main() {
	obsURL := flag.String("obs", "ws://127.0.0.1:4455", "OBS WebSocket URL")
	obsPassword := flag.String("password", "", "OBS WebSocket password")
	workerURL := flag.String("worker", "", "Cloudflare Worker URL for remote access")
	joinCode := flag.String("join", "", "Join code for tunnel identification")
	listenAddr := flag.String("listen", "127.0.0.1:4456", "Local listening address")

	flag.Parse()

	cfg := Config{
		OBSURL:      *obsURL,
		OBSPassword: *obsPassword,
		WorkerURL:   *workerURL,
		JoinCode:    *joinCode,
		ListenAddr:  *listenAddr,
	}

	fmt.Printf("DockForLife Proxy Agent v1.0.0\n")
	fmt.Printf("================================\n")
	fmt.Printf("OBS URL: %s\n", cfg.OBSURL)
	fmt.Printf("Worker: %s\n", cfg.WorkerURL)
	fmt.Printf("Join Code: %s\n", cfg.JoinCode)
	fmt.Printf("\n")

	proxyAgent, err := NewAgent(cfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create agent: %v\n", err)
		os.Exit(1)
	}

	if err := proxyAgent.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to start agent: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Agent started. Press Ctrl+C to stop.")

	<-proxyAgent.ctx.Done()
}
