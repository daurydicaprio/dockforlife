package main

import (
	"bufio"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
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
	if cfg.OBSURL == "" {
		cfg.OBSURL = "ws://127.0.0.1:4455"
	}
	if cfg.ReconnectDelay == 0 {
		cfg.ReconnectDelay = 5 * time.Second
	}
	if cfg.WorkerURL == "" {
		cfg.WorkerURL = "wss://remote.daurydicaprio.com/ws"
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
	fmt.Printf("\n")
	fmt.Printf("╔══════════════════════════════════════════════════════════╗\n")
	fmt.Printf("║           DockForLife Proxy Agent v1.0                  ║\n")
	fmt.Printf("║                                                          ║\n")
	fmt.Printf("║  OBS WebSocket: %-38s   ║\n", a.cfg.OBSURL)
	fmt.Printf("║  Worker URL:    %-38s   ║\n", a.cfg.WorkerURL)
	fmt.Printf("╚══════════════════════════════════════════════════════════╝\n")
	fmt.Printf("\n")

	code := a.cfg.JoinCode
	if code == "" {
		code = a.promptJoinCode()
	}
	a.cfg.JoinCode = strings.ToUpper(code)

	fmt.Printf("\n[Agent] Join Code: %s\n", a.cfg.JoinCode)
	fmt.Printf("[Agent] Share this code on your iPad/mobile device to connect\n")
	fmt.Printf("\n")

	go a.connectOBSWithRetry()
	go a.connectWorkerWithRetry()
	go a.handleShutdown()

	return nil
}

func (a *Agent) promptJoinCode() string {
	reader := bufio.NewReader(os.Stdin)

	fmt.Printf("Enter a Join Code (4-12 chars, e.g., MOMO), or press Enter to generate one: ")
	code, _ := reader.ReadString('\n')
	code = strings.TrimSpace(code)

	if code == "" {
		code = generateJoinCode()
		fmt.Printf("Generated code: %s\n", code)
	}

	return code
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
				log.Printf("[OBS] Connection failed: %v", err)
				if a.cfg.AutoReconnect {
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

	log.Printf("[OBS] Connecting to OBS: %s", a.cfg.OBSURL)

	obs, _, err := websocket.DefaultDialer.Dial(a.cfg.OBSURL, nil)
	if err != nil {
		return fmt.Errorf("failed to connect to OBS: %w", err)
	}

	a.mu.Lock()
	a.obsConn = obs
	a.connected = true
	a.mu.Unlock()

	fmt.Printf("[OBS] ✓ Connected to OBS\n")

	go a.handleOBSMessages()

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
				log.Printf("[Worker] Connection failed: %v", err)
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

	if !strings.HasPrefix(workerURL, "wss://") && !strings.HasPrefix(workerURL, "https://") {
		workerURL = "wss://" + workerURL
	}

	fullURL := fmt.Sprintf("%s?code=%s&role=host", workerURL, a.cfg.JoinCode)
	fmt.Printf("[Worker] Connecting to %s\n", fullURL)

	header := http.Header{}
	header.Set("Upgrade", "websocket")
	header.Set("Connection", "Upgrade")
	header.Set("Sec-WebSocket-Version", "13")

	conn, resp, err := websocket.DefaultDialer.Dial(fullURL, header)
	if err != nil {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to connect to worker: %w, response: %s", err, string(body))
	}

	a.mu.Lock()
	a.workerConn = conn
	a.mu.Unlock()

	fmt.Printf("[Worker] Socket opened, sending register...\n")

	registerMsg := map[string]interface{}{
		"type": "register",
		"role": "host",
		"code": a.cfg.JoinCode,
	}

	if err := conn.WriteJSON(registerMsg); err != nil {
		return fmt.Errorf("failed to send register: %w", err)
	}

	fmt.Printf("[Worker] ✓ Registered with code: %s\n", a.cfg.JoinCode)

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
	fmt.Printf("[Agent] Stopped\n")
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
				log.Printf("[OBS] Read error: %v", err)
				a.mu.Lock()
				a.obsConn = nil
				a.connected = false
				a.mu.Unlock()
				go a.connectOBSWithRetry()
				return
			}

			a.mu.Lock()
			worker := a.workerConn
			a.mu.Unlock()

			if worker != nil {
				workerMsg := map[string]interface{}{
					"type":      "obs_event",
					"joinCode":  a.cfg.JoinCode,
					"eventData": string(message),
				}
				if err := worker.WriteJSON(workerMsg); err != nil {
					log.Printf("[Agent] Failed to forward OBS event: %v", err)
				}
			}
		}
	}
}

func (a *Agent) handleWorkerMessages() {
	for {
		select {
		case <-a.stopChan:
			return
		case <-a.ctx.Done():
			return
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
				log.Printf("[Worker] Read error: %v", err)
				a.mu.Lock()
				a.workerConn = nil
				a.mu.Unlock()
				go a.connectWorkerWithRetry()
				return
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

			case "client_joined":
				fmt.Printf("[Worker] ✓ Client connected!\n")

			case "peer_connected":
				fmt.Printf("[Worker] ✓ Peer connected!\n")

			case "waiting":
				fmt.Printf("[Worker] Waiting for client...\n")

			case "connected":
				fmt.Printf("[Worker] ✓ Connected to remote client!\n")
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

	log.Printf("[OBS] Sent command: %s", method)
	return nil
}

func generateRequestID() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}

func generateJoinCode() string {
	chars := "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	result := ""
	rand := time.Now().UnixNano()
	for i := 0; i < 8; i++ {
		result += string(chars[rand%int64(len(chars))])
		rand = (rand*1103515245 + 12345) & 0x7fffffff
	}
	return result
}

func main() {
	obsURL := flag.String("obs", "", "OBS WebSocket URL (default: ws://127.0.0.1:4455)")
	obsPassword := flag.String("password", "", "OBS WebSocket password")
	workerURL := flag.String("worker", "", "Cloudflare Worker URL (default: wss://remote.daurydicaprio.com/ws)")
	joinCode := flag.String("code", "", "Join code for this host")
	noAutoReconnect := flag.Bool("no-auto-reconnect", false, "Disable auto-reconnect")

	flag.Parse()

	cfg := Config{
		OBSURL:         *obsURL,
		OBSPassword:    *obsPassword,
		WorkerURL:      *workerURL,
		JoinCode:       *joinCode,
		AutoReconnect:  !*noAutoReconnect,
		ReconnectDelay: 5 * time.Second,
	}

	agent := NewAgent(cfg)
	if err := agent.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to start agent: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("[Agent] Running. Press Ctrl+C to stop.\n")
	<-agent.ctx.Done()
}
