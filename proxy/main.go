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
	OBSURL         string
	OBSPassword    string
	WorkerURL      string
	JoinCode       string
	ListenAddr     string
	AutoReconnect  bool
	ReconnectDelay time.Duration
}

type Agent struct {
	cfg        Config
	obsConn    *websocket.Conn
	workerConn *websocket.Conn
	ctx        context.Context
	cancel     context.CancelFunc
	mu         sync.Mutex
	connected  bool
	stopChan   chan struct{}
}

func NewAgent(cfg Config) *Agent {
	if cfg.ListenAddr == "" {
		cfg.ListenAddr = "127.0.0.1:4456"
	}
	if cfg.OBSURL == "" {
		cfg.OBSURL = "ws://127.0.0.1:4455"
	}
	if cfg.ReconnectDelay == 0 {
		cfg.ReconnectDelay = 5 * time.Second
	}
	cfg.AutoReconnect = true

	ctx, cancel := context.WithCancel(context.Background())

	return &Agent{
		cfg:      cfg,
		ctx:      ctx,
		cancel:   cancel,
		stopChan: make(chan struct{}),
	}
}

func (a *Agent) Start() error {
	log.Printf("[Agent] Starting DockForLife Proxy Agent v1.0")
	log.Printf("[Agent] OBS URL: %s", a.cfg.OBSURL)
	log.Printf("[Agent] Auto-reconnect: %v", a.cfg.AutoReconnect)

	go a.connectOBSWithRetry()
	go a.handleShutdown()

	return nil
}

func (a *Agent) connectOBSWithRetry() {
	for {
		select {
		case <-a.stopChan:
			return
		case <-a.ctx.Done():
			return
		default:
			if err := a.connectOBS(); err != nil {
				log.Printf("[Agent] OBS connection failed: %v", err)
				if a.cfg.AutoReconnect {
					log.Printf("[Agent] Retrying in %v...", a.cfg.ReconnectDelay)
					select {
					case <-a.stopChan:
						return
					case <-a.ctx.Done():
						return
					case <-time.After(a.cfg.ReconnectDelay):
						continue
					}
				}
			}
			return
		}
	}
}

func (a *Agent) connectOBS() error {
	a.mu.Lock()
	if a.connected {
		a.mu.Unlock()
		return nil
	}
	a.mu.Unlock()

	log.Printf("[Agent] Connecting to OBS: %s", a.cfg.OBSURL)

	obs, _, err := websocket.DefaultDialer.Dial(a.cfg.OBSURL, nil)
	if err != nil {
		return fmt.Errorf("failed to connect to OBS: %w", err)
	}

	a.mu.Lock()
	a.obsConn = obs
	a.connected = true
	a.mu.Unlock()

	log.Printf("[Agent] Connected to OBS")

	go a.handleOBSMessages()

	if a.cfg.WorkerURL != "" && a.cfg.JoinCode != "" {
		go a.connectWorkerWithRetry()
	}

	return nil
}

func (a *Agent) connectWorkerWithRetry() {
	for {
		select {
		case <-a.stopChan:
			return
		case <-a.ctx.Done():
			return
		default:
			if err := a.connectWorker(); err != nil {
				log.Printf("[Agent] Worker connection failed: %v", err)
				select {
				case <-a.stopChan:
					return
				case <-a.ctx.Done():
					return
				case <-time.After(a.cfg.ReconnectDelay):
					continue
				}
			}
			return
		}
	}
}

func (a *Agent) connectWorker() error {
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
		return fmt.Errorf("failed to connect to worker: %w", err)
	}

	a.mu.Lock()
	a.workerConn = conn
	a.mu.Unlock()

	log.Printf("[Agent] Connected to Cloudflare Worker")

	registerMsg := map[string]interface{}{
		"type":     "register",
		"joinCode": a.cfg.JoinCode,
	}
	if err := conn.WriteJSON(registerMsg); err != nil {
		return fmt.Errorf("failed to register: %w", err)
	}

	log.Printf("[Agent] Registered with join code: %s", a.cfg.JoinCode)

	go a.handleWorkerMessages()

	return nil
}

func (a *Agent) Stop() {
	close(a.stopChan)
	a.cancel()

	a.mu.Lock()
	defer a.mu.Unlock()

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
		case <-a.stopChan:
			return
		case <-a.ctx.Done():
			return
		default:
			a.mu.Lock()
			obs := a.obsConn
			a.mu.Unlock()

			if obs == nil {
				time.Sleep(100 * time.Millisecond)
				continue
			}

			_, message, err := obs.ReadMessage()
			if err != nil {
				log.Printf("[Agent] OBS read error: %v", err)
				a.mu.Lock()
				a.obsConn = nil
				a.connected = false
				a.mu.Unlock()
				go a.connectOBSWithRetry()
				return
			}

			var obsEvent map[string]interface{}
			if err := json.Unmarshal(message, &obsEvent); err != nil {
				continue
			}

			a.mu.Lock()
			worker := a.workerConn
			a.mu.Unlock()

			if worker != nil {
				workerMsg := map[string]interface{}{
					"type":      "obs_event",
					"joinCode":  a.cfg.JoinCode,
					"eventData": obsEvent,
				}
				if err := worker.WriteJSON(workerMsg); err != nil {
					log.Printf("[Agent] Failed to send OBS event: %v", err)
				}
			}
		}
	}
}

func (a *Agent) handleWorkerMessages() {
	pingTicker := time.NewTicker(15 * time.Second)
	defer pingTicker.Stop()

	for {
		select {
		case <-a.stopChan:
			return
		case <-a.ctx.Done():
			return
		case <-pingTicker.C:
			a.mu.Lock()
			worker := a.workerConn
			a.mu.Unlock()
			if worker != nil {
				worker.WriteMessage(websocket.TextMessage, []byte("pong"))
			}
		default:
			a.mu.Lock()
			worker := a.workerConn
			a.mu.Unlock()

			if worker == nil {
				time.Sleep(100 * time.Millisecond)
				continue
			}

			_, message, err := worker.ReadMessage()
			if err != nil {
				log.Printf("[Agent] Worker read error: %v", err)
				a.mu.Lock()
				a.workerConn = nil
				a.mu.Unlock()
				go a.connectWorkerWithRetry()
				return
			}

			messageStr := string(message)
			if messageStr == "pong" {
				continue
			}

			var workerMsg map[string]interface{}
			if err := json.Unmarshal(message, &workerMsg); err != nil {
				continue
			}

			msgType, _ := workerMsg["type"].(string)

			switch msgType {
			case "ping":
				worker.WriteMessage(websocket.TextMessage, []byte("pong"))

			case "command":
				method, _ := workerMsg["method"].(string)
				params, _ := workerMsg["params"].(map[string]interface{})
				if method != "" {
					a.SendCommand(method, params)
				}

			case "host_disconnected":
				log.Printf("[Agent] Host disconnected (should not happen)")

			case "client_joined":
				log.Printf("[Agent] Client joined the session")
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

	if a.obsConn == nil {
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
	noAutoReconnect := flag.Bool("no-auto-reconnect", false, "Disable auto-reconnect")

	flag.Parse()

	cfg := Config{
		OBSURL:         *obsURL,
		OBSPassword:    *obsPassword,
		WorkerURL:      *workerURL,
		JoinCode:       *joinCode,
		ListenAddr:     *listenAddr,
		AutoReconnect:  !*noAutoReconnect,
		ReconnectDelay: 5 * time.Second,
	}

	fmt.Printf("DockForLife Proxy Agent v1.0.0\n")
	fmt.Printf("================================\n")
	fmt.Printf("OBS URL: %s\n", cfg.OBSURL)
	fmt.Printf("Worker: %s\n", cfg.WorkerURL)
	fmt.Printf("Join Code: %s\n", cfg.JoinCode)
	fmt.Printf("Auto-reconnect: %v\n", cfg.AutoReconnect)
	fmt.Printf("\n")

	agent := NewAgent(cfg)
	if err := agent.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to start agent: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Agent started. Press Ctrl+C to stop.")

	<-agent.ctx.Done()
}
