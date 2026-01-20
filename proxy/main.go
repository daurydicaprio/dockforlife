package main

import (
	"bufio"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
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
	fmt.Printf("╚══════════════════════════════════════════════════════════╝\n")
	fmt.Printf("\n")

	code := a.cfg.JoinCode
	if code == "" {
		code = a.promptJoinCode()
	}
	a.cfg.JoinCode = strings.ToUpper(code)

	fmt.Printf("\n[Agent] Join Code: %s\n", a.cfg.JoinCode)
	fmt.Printf("[Agent] Waiting for client connection...\n")
	fmt.Printf("\n")

	go a.connectOBSWithRetry()
	go a.connectWorkerWithRetry()
	go a.handleShutdown()

	return nil
}

func (a *Agent) promptJoinCode() string {
	reader := bufio.NewReader(os.Stdin)

	fmt.Printf("Enter Join Code (4-12 chars) or press Enter to generate: ")
	code, _ := reader.ReadString('\n')
	code = strings.TrimSpace(code)

	if code == "" {
		code = generateJoinCode()
		fmt.Printf("Generated: %s\n", code)
	}

	return strings.ToUpper(code)
}

func (a *Agent) connectOBSWithRetry() {
	for {
		select {
		case <-a.stopChan:
			return
		case <-a.ctx.Done():
			return
		case <-time.After(a.cfg.ReconnectDelay):
			if err := a.connectOBS(); err != nil {
				log.Printf("[OBS] Retry: %v", err)
				continue
			}
			return
		}
	}
}

func (a *Agent) connectOBS() error {
	a.mu.Lock()
	if a.obsConn != nil {
		a.mu.Unlock()
		return nil
	}
	a.mu.Unlock()

	fmt.Printf("[OBS] Connecting to %s\n", a.cfg.OBSURL)

	obs, resp, err := websocket.DefaultDialer.Dial(a.cfg.OBSURL, nil)
	if err != nil {
		if resp != nil {
			body, _ := io.ReadAll(resp.Body)
			fmt.Printf("[OBS] Failed: %v\n", string(body))
		}
		return err
	}

	a.mu.Lock()
	a.obsConn = obs
	a.mu.Unlock()

	fmt.Printf("[OBS] ✓ Connected\n")

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
			fmt.Printf("[Worker] Worker error, waiting 5s before retry...\n")
			time.Sleep(5 * time.Second)

			if err := a.connectWorker(); err != nil {
				fmt.Printf("[Worker] Retry failed: %v\n", err)
				continue
			}
			return
		}
	}
}

func (a *Agent) connectWorker() error {
	workerURL := a.cfg.WorkerURL

	if !strings.HasPrefix(workerURL, "wss://") {
		workerURL = "wss://" + workerURL
	}

	fullURL := fmt.Sprintf("%s?code=%s&role=host", workerURL, a.cfg.JoinCode)
	fmt.Printf("[Worker] Connecting: %s\n", fullURL)

	a.mu.Lock()
	if a.workerConn != nil {
		a.mu.Unlock()
		return nil
	}
	a.mu.Unlock()

	conn, resp, err := websocket.DefaultDialer.Dial(fullURL, nil)
	if err != nil {
		if resp != nil {
			body, _ := io.ReadAll(resp.Body)
			fmt.Printf("[Worker] Failed: %v\n% s\n", err, string(body))
		}
		return err
	}

	a.mu.Lock()
	a.workerConn = conn
	a.mu.Unlock()

	fmt.Printf("[Worker] ✓ Connected, sending register...\n")

	registerMsg := map[string]interface{}{
		"type": "register",
		"role": "host",
		"code": a.cfg.JoinCode,
	}

	if err := conn.WriteJSON(registerMsg); err != nil {
		fmt.Printf("[Worker] Register failed: %v\n", err)
		a.mu.Lock()
		a.workerConn = nil
		a.mu.Unlock()
		return err
	}

	fmt.Printf("[Worker] ✓ Registered as Host [%s]\n", a.cfg.JoinCode)

	go a.startHeartbeat()
	go a.handleWorkerMessages()

	return nil
}

func (a *Agent) startHeartbeat() {
	fmt.Printf("[Worker] Starting heartbeat (15s interval)\n")
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-a.stopChan:
			return
		case <-a.ctx.Done():
			return
		case <-ticker.C:
			a.mu.Lock()
			conn := a.workerConn
			a.mu.Unlock()

			if conn != nil {
				if err := conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"ping"}`)); err != nil {
					fmt.Printf("[Worker] Ping failed: %v\n", err)
				} else {
					fmt.Printf("[Worker] Ping sent\n")
				}
			}
		}
	}
}

func (a *Agent) closeLocalOBS() {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.obsConn != nil {
		fmt.Printf("[Agent] Closing local OBS connection (switching to remote)\n")
		a.obsConn.Close()
		a.obsConn = nil
	}
}

func (a *Agent) Stop() {
	close(a.stopChan)
	a.cancel()

	a.mu.Lock()
	defer a.mu.Unlock()

	if a.obsConn != nil {
		a.obsConn.Close()
		a.obsConn = nil
	}
	if a.workerConn != nil {
		a.workerConn.Close()
		a.workerConn = nil
	}

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
				a.mu.Lock()
				a.obsConn = nil
				a.mu.Unlock()
				go a.connectOBSWithRetry()
				return
			}

			a.mu.Lock()
			worker := a.workerConn
			a.mu.Unlock()

			if worker != nil {
				worker.WriteJSON(map[string]interface{}{
					"type":      "obs_event",
					"code":      a.cfg.JoinCode,
					"eventData": string(message),
				})
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
				a.mu.Lock()
				a.workerConn = nil
				a.mu.Unlock()
				go a.connectWorkerWithRetry()
				return
			}

			var msg map[string]interface{}
			if err := json.Unmarshal(message, &msg); err != fmt.Errorf("unmarshal error: %w", err) {
				fmt.Printf("[Worker] Failed to parse message: %v\n", err)
				continue
			}

			msgType, _ := msg["type"].(string)
			fmt.Printf("[Worker] Received: %s\n", msgType)

			switch msgType {
			case "ping":
				fmt.Printf("[Worker] Ping received, sending pong\n")
				worker.WriteMessage(websocket.TextMessage, []byte(`{"type":"pong"}`))
			case "pong":
				fmt.Printf("[Worker] Pong received\n")
			case "obs_command":
				command, _ := msg["command"].(string)
				args, _ := msg["args"].(map[string]interface{})
				if command != "" {
					fmt.Printf("[Worker] Executing: %s with args: %v\n", command, args)
					a.SendCommand(command, args)
				}
			case "peer_connected":
				fmt.Printf("[Worker] Client connected!\n")
			case "error":
				errMsg, _ := msg["message"].(string)
				fmt.Printf("[Worker] Error: %s\n", errMsg)
			default:
				fmt.Printf("[Worker] Unknown message type: %s\n", msgType)
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
		return fmt.Errorf("no OBS connection")
	}

	return a.obsConn.WriteJSON(map[string]interface{}{
		"requestType": method,
		"requestId":   fmt.Sprintf("%d", time.Now().UnixNano()),
		"requestData": params,
	})
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
	obsURL := flag.String("obs", "", "OBS WebSocket URL")
	obsPassword := flag.String("password", "", "OBS password")
	workerURL := flag.String("worker", "", "Worker URL")
	joinCode := flag.String("code", "", "Join code")
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
		fmt.Fprintf(os.Stderr, "Failed: %v\n", err)
		os.Exit(1)
	}

	<-agent.ctx.Done()
}
