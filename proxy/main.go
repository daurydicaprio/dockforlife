package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"net/url"
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
	mu         sync.Mutex
	ctx        context.Context
	cancel     context.CancelFunc
}

type OBSMessage struct {
	Op   int             `json:"op"`
	D    json.RawMessage `json:"d"`
	Type string          `json:"type,omitempty"`
	Id   string          `json:"id,omitempty"`
	Data json.RawMessage `json:"data,omitempty"`
}

func NewAgent(cfg Config) *Agent {
	ctx, cancel := context.WithCancel(context.Background())
	return &Agent{
		cfg:    cfg,
		ctx:    ctx,
		cancel: cancel,
	}
}

func (a *Agent) Start() error {
	if err := a.connectOBS(); err != nil {
		return err
	}
	if err := a.connectWorker(); err != nil {
		return err
	}

	go a.handleOBSMessages()
	go a.handleWorkerMessages()
	go a.handleShutdown()

	fmt.Printf("[Agent] Started successfully\n")
	return nil
}

func (a *Agent) Stop() {
	a.cancel()
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.obsConn != nil {
		a.obsConn.Close()
	}
	if a.workerConn != nil {
		a.workerConn.Close()
	}
}

func (a *Agent) connectOBS() error {
	u, err := url.Parse(a.cfg.OBSURL)
	if err != nil {
		return fmt.Errorf("invalid OBS URL: %w", err)
	}

	if u.Scheme == "" {
		u.Scheme = "ws"
	}

	conn, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
	if err != nil {
		return fmt.Errorf("failed to connect to OBS: %w", err)
	}

	a.mu.Lock()
	a.obsConn = conn
	a.mu.Unlock()

	fmt.Printf("[OBS] Connected to %s\n", u.String())

	return nil
}

func (a *Agent) connectWorker() error {
	workerURL := a.cfg.WorkerURL
	if !strings.HasPrefix(workerURL, "wss://") && !strings.HasPrefix(workerURL, "ws://") {
		workerURL = "wss://" + workerURL
	}

	fullURL := fmt.Sprintf("%s?code=%s&role=host", workerURL, a.cfg.JoinCode)

	conn, _, err := websocket.DefaultDialer.Dial(fullURL, nil)
	if err != nil {
		return fmt.Errorf("failed to connect to Worker: %w", err)
	}

	a.mu.Lock()
	a.workerConn = conn
	a.mu.Unlock()

	fmt.Printf("[Worker] Connected to %s\n", fullURL)

	registerMsg := map[string]interface{}{
		"type": "register",
		"role": "host",
		"code": a.cfg.JoinCode,
	}

	if err := conn.WriteJSON(registerMsg); err != nil {
		return fmt.Errorf("failed to register: %w", err)
	}

	fmt.Printf("[Worker] Registered as Host [%s]\n", a.cfg.JoinCode)

	go a.startHeartbeat()

	return nil
}

func (a *Agent) startHeartbeat() {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-a.ctx.Done():
			return
		case <-ticker.C:
			a.mu.Lock()
			conn := a.workerConn
			a.mu.Unlock()
			if conn != nil {
				if err := conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"ping"}`)); err != nil {
					fmt.Printf("[Worker] Ping failed: %v\n", err)
				}
			}
		}
	}
}

func (a *Agent) handleOBSMessages() {
	for {
		select {
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
				fmt.Printf("[OBS] Connection lost: %v, reconnecting...\n", err)
				a.mu.Lock()
				a.obsConn = nil
				a.mu.Unlock()
				time.Sleep(time.Second)
				if err := a.connectOBS(); err != nil {
					fmt.Printf("[OBS] Reconnect failed: %v\n", err)
				}
				continue
			}

			var msg OBSMessage
			if err := json.Unmarshal(message, &msg); err != nil {
				fmt.Printf("[OBS] Parse error: %v\n", err)
				continue
			}

			switch msg.Op {
			case 0:
				fmt.Printf("[OBS] Hello received, sending Identify...\n")
				identifyMsg := OBSMessage{
					Op: 1,
					D:  json.RawMessage(`{"rpcVersion":1,"authentication":"","eventSubscriptions":1}`),
				}
				a.mu.Lock()
				conn := a.obsConn
				a.mu.Unlock()
				if conn != nil {
					conn.WriteJSON(identifyMsg)
					fmt.Printf("[OBS] Identify sent\n")
				}
			case 2:
				fmt.Printf("[OBS] Identified successfully\n")
			case 5:
				fmt.Printf("[OBS] Event received\n")
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
			case 7:
				respId := msg.Id
				if respId != "" {
					fmt.Printf("[OBS] Response received: %s\n", respId)
				}
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
			a.mu.Lock()
			worker := a.workerConn
			a.mu.Unlock()

			if worker == nil {
				time.Sleep(100 * time.Millisecond)
				continue
			}

			_, message, err := worker.ReadMessage()
			if err != nil {
				fmt.Printf("[Worker] Connection lost: %v\n", err)
				a.mu.Lock()
				a.workerConn = nil
				a.mu.Unlock()
				time.Sleep(5 * time.Second)
				if err := a.connectWorker(); err != nil {
					fmt.Printf("[Worker] Reconnect failed: %v\n", err)
				}
				continue
			}

			var msg map[string]interface{}
			if err := json.Unmarshal(message, &msg); err != nil {
				continue
			}

			msgType, _ := msg["type"].(string)

			switch msgType {
			case "ping":
				worker.WriteMessage(websocket.TextMessage, []byte(`{"type":"pong"}`))
			case "obs_command":
				command, _ := msg["command"].(string)
				args, _ := msg["args"].(map[string]interface{})
				if command != "" {
					fmt.Printf("[Worker] Command: %s with args: %v\n", command, args)
					a.SendCommand(command, args)
				}
			case "peer_connected":
				fmt.Printf("[Worker] Client connected!\n")
				a.sendOBSData()
			case "request_update":
				fmt.Printf("[Worker] request_update received\n")
				a.sendOBSData()
			}
		}
	}
}

func (a *Agent) sendOBSData() {
	a.mu.Lock()
	obs := a.obsConn
	a.mu.Unlock()

	if obs == nil {
		fmt.Printf("[OBS] No connection\n")
		return
	}

	fmt.Printf("[OBS] Fetching data...\n")

	scenes, err := a.callOBS("GetSceneList")
	if err != nil {
		fmt.Printf("[OBS] Failed to get scenes: %v\n", err)
	} else {
		fmt.Printf("[OBS] Got %d scenes\n", len(scenes))
	}

	inputs, err := a.callOBS("GetInputList")
	if err != nil {
		fmt.Printf("[OBS] Failed to get inputs: %v\n", err)
	} else {
		fmt.Printf("[OBS] Got %d inputs\n", len(inputs))
	}

	if len(scenes) == 0 && len(inputs) == 0 {
		fmt.Printf("[OBS] No data to send\n")
		return
	}

	obsData := map[string]interface{}{
		"type":   "obs_data",
		"scenes": scenes,
		"inputs": inputs,
		"status": "ok",
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	if a.workerConn != nil {
		jsonData, _ := json.Marshal(obsData)
		fmt.Printf("[Worker] Sending obs_data: %s\n", string(jsonData))
		if err := a.workerConn.WriteJSON(obsData); err != nil {
			fmt.Printf("[Worker] Failed to send: %v\n", err)
		} else {
			fmt.Printf("[Worker] obs_data sent successfully\n")
		}
	}
}

func (a *Agent) callOBS(requestType string) ([]string, error) {
	a.mu.Lock()
	obs := a.obsConn
	a.mu.Unlock()

	if obs == nil {
		return nil, fmt.Errorf("no OBS connection")
	}

	requestId := fmt.Sprintf("req_%d", time.Now().UnixNano())

	requestData := map[string]interface{}{
		"requestType": requestType,
		"requestId":   requestId,
	}

	requestDataJSON, _ := json.Marshal(requestData)
	fmt.Printf("[OBS] Calling %s with payload: %s\n", requestType, string(requestDataJSON))

	request := OBSMessage{
		Op: 6,
		D:  requestDataJSON,
	}

	requestJSON, _ := json.Marshal(request)
	fmt.Printf("[OBS] Full request: %s\n", string(requestJSON))

	a.mu.Lock()
	err := obs.WriteJSON(request)
	a.mu.Unlock()

	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}

	timeout := time.After(2 * time.Second)
	done := make(chan []string)
	var result []string

	go func() {
		for {
			a.mu.Lock()
			conn := a.obsConn
			a.mu.Unlock()

			if conn == nil {
				done <- nil
				return
			}

			_, msg, err := conn.ReadMessage()
			if err != nil {
				done <- nil
				return
			}

			var resp OBSMessage
			if err := json.Unmarshal(msg, &resp); err != nil {
				fmt.Printf("[OBS] Parse response error: %v\n", err)
				continue
			}

			if resp.Op == 7 && resp.Id == requestId {
				fmt.Printf("[OBS] Response received for %s\n", requestType)

				var respData map[string]interface{}
				json.Unmarshal(resp.D, &respData)
				fmt.Printf("[OBS] Response data: %s\n", string(resp.D))

				switch requestType {
				case "GetSceneList":
					if scenesRaw, ok := respData["scenes"].([]interface{}); ok {
						result = make([]string, len(scenesRaw))
						for i, s := range scenesRaw {
							if scene, ok := s.(map[string]interface{}); ok {
								if name, ok := scene["sceneName"].(string); ok {
									result[i] = name
								}
							}
						}
					}
				case "GetInputList":
					if inputsRaw, ok := respData["inputs"].([]interface{}); ok {
						result = make([]string, len(inputsRaw))
						for i, inp := range inputsRaw {
							if input, ok := inp.(map[string]interface{}); ok {
								if name, ok := input["inputName"].(string); ok {
									result[i] = name
								}
							}
						}
					}
				}

				done <- result
				return
			}
		}
	}()

	select {
	case result = <-done:
		if result == nil {
			return nil, fmt.Errorf("connection lost")
		}
		return result, nil
	case <-timeout:
		return nil, fmt.Errorf("timeout waiting for %s", requestType)
	}
}

func (a *Agent) SendCommand(method string, params map[string]interface{}) error {
	a.mu.Lock()
	obs := a.obsConn
	a.mu.Unlock()

	if obs == nil {
		return fmt.Errorf("no OBS connection")
	}

	obsMethod := a.mapToOBSMethod(method)

	requestData := map[string]interface{}{
		"requestType": obsMethod,
		"requestId":   fmt.Sprintf("cmd_%d", time.Now().UnixNano()),
	}

	if params != nil {
		for k, v := range params {
			requestData[k] = v
		}
	}

	requestDataJSON, _ := json.Marshal(requestData)
	fmt.Printf("[OBS] Command %s with payload: %s\n", obsMethod, string(requestDataJSON))

	request := OBSMessage{
		Op: 6,
		D:  requestDataJSON,
	}

	requestJSON, _ := json.Marshal(request)
	fmt.Printf("[OBS] Full command: %s\n", string(requestJSON))

	a.mu.Lock()
	err := obs.WriteJSON(request)
	a.mu.Unlock()

	return err
}

func (a *Agent) mapToOBSMethod(webMethod string) string {
	switch webMethod {
	case "Record":
		return "ToggleRecord"
	case "Stream":
		return "ToggleStream"
	case "Scene":
		return "SetCurrentProgramScene"
	case "Mute":
		return "ToggleInputMute"
	case "Filter":
		return "SetSourceFilterEnabled"
	case "Visibility":
		return "SetSceneItemEnabled"
	default:
		return webMethod
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

func generateJoinCode() string {
	chars := "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	result := ""
	for i := 0; i < 8; i++ {
		result += string(chars[time.Now().UnixNano()%int64(len(chars))])
		time.Sleep(1 * time.Millisecond)
	}
	return result
}

func main() {
	obsURL := flag.String("obs", "ws://127.0.0.1:4455", "OBS WebSocket URL")
	workerURL := flag.String("worker", "wss://remote.daurydicaprio.com/ws", "Worker URL")
	joinCode := flag.String("code", "", "Join code")

	flag.Parse()

	cfg := Config{
		OBSURL:         *obsURL,
		WorkerURL:      *workerURL,
		JoinCode:       *joinCode,
		AutoReconnect:  true,
		ReconnectDelay: 5 * time.Second,
	}

	if cfg.JoinCode == "" {
		cfg.JoinCode = generateJoinCode()
		fmt.Printf("[Agent] Generated code: %s\n", cfg.JoinCode)
	}

	agent := NewAgent(cfg)
	if err := agent.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "Failed: %v\n", err)
		os.Exit(1)
	}

	<-agent.ctx.Done()
}
