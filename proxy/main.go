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
	cfg         Config
	obsConn     *websocket.Conn
	workerConn  *websocket.Conn
	mu          sync.Mutex
	pendingReqs map[string]chan []byte
	ctx         context.Context
	cancel      context.CancelFunc
}

type OBSMessage struct {
	Op int             `json:"op"`
	D  json.RawMessage `json:"d"`
}

func NewAgent(cfg Config) *Agent {
	ctx, cancel := context.WithCancel(context.Background())
	return &Agent{
		cfg:         cfg,
		pendingReqs: make(map[string]chan []byte),
		ctx:         ctx,
		cancel:      cancel,
	}
}

func (a *Agent) addPendingRequest(id string) chan []byte {
	a.mu.Lock()
	defer a.mu.Unlock()
	ch := make(chan []byte, 1)
	a.pendingReqs[id] = ch
	return ch
}

func (a *Agent) getPendingRequest(id string) (chan []byte, bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	ch, ok := a.pendingReqs[id]
	return ch, ok
}

func (a *Agent) removePendingRequest(id string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	delete(a.pendingReqs, id)
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
				a.mu.Lock()
				for id, ch := range a.pendingReqs {
					close(ch)
					delete(a.pendingReqs, id)
				}
				a.mu.Unlock()
				time.Sleep(time.Second)
				if err := a.connectOBS(); err != nil {
					fmt.Printf("[OBS] Reconnect failed: %v\n", err)
				}
				continue
			}

			var msg OBSMessage
			if err := json.Unmarshal(message, &msg); err != nil {
				continue
			}

			switch msg.Op {
			case 0:
				fmt.Printf("[OBS] Hello received, sending Identify...\n")
				identifyMsg := map[string]interface{}{
					"op": 1,
					"d": map[string]interface{}{
						"rpcVersion":         1,
						"authentication":     "",
						"eventSubscriptions": 1,
					},
				}
				a.mu.Lock()
				conn := a.obsConn
				a.mu.Unlock()
				if conn != nil {
					conn.WriteJSON(identifyMsg)
				}
			case 2:
				fmt.Printf("[OBS] Identified successfully\n")
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
				var respData map[string]interface{}
				json.Unmarshal(msg.D, &respData)
				requestId, _ := respData["requestId"].(string)
				requestType, _ := respData["requestType"].(string)

				if errorMsg, ok := respData["error"].(string); ok {
					fmt.Printf("[OBS] ERROR: %s - %s\n", requestType, errorMsg)
				} else if requestType != "" {
					fmt.Printf("[OBS] OK: %s completado\n", requestType)
				}

				if ch, ok := a.getPendingRequest(requestId); ok {
					select {
					case ch <- msg.D:
					default:
					}
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
					fmt.Printf("[Worker] Command: %s\n", command)
					a.SendCommand(command, args)
				}
			case "peer_connected":
				fmt.Printf("[Worker] Client connected, fetching OBS data...\n")
				time.Sleep(500 * time.Millisecond)
				a.sendOBSData()
			case "request_update":
				time.Sleep(200 * time.Millisecond)
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
		return
	}

	scenes, _ := a.callOBS("GetSceneList")
	inputs, _ := a.callOBS("GetInputList")

	fmt.Printf("[OBS] Inputs disponibles: %v\n", inputs)
	fmt.Printf("[OBS] Escenas disponibles: %v\n", scenes)

	if len(scenes) == 0 && len(inputs) == 0 {
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
		a.workerConn.WriteJSON(obsData)
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

	request := map[string]interface{}{
		"op": 6,
		"d":  requestData,
	}

	ch := a.addPendingRequest(requestId)

	a.mu.Lock()
	err := obs.WriteJSON(request)
	a.mu.Unlock()

	if err != nil {
		a.removePendingRequest(requestId)
		return nil, fmt.Errorf("failed to send request: %w", err)
	}

	select {
	case responseData := <-ch:
		a.removePendingRequest(requestId)

		var respData map[string]interface{}
		json.Unmarshal(responseData, &respData)

		responseDataObj, ok := respData["responseData"].(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("no responseData in response")
		}

		switch requestType {
		case "GetSceneList":
			if scenesRaw, ok := responseDataObj["scenes"].([]interface{}); ok {
				scenes := make([]string, len(scenesRaw))
				for i, s := range scenesRaw {
					if scene, ok := s.(map[string]interface{}); ok {
						if name, ok := scene["sceneName"].(string); ok {
							scenes[i] = name
						}
					}
				}
				return scenes, nil
			}
		case "GetInputList":
			if inputsRaw, ok := responseDataObj["inputs"].([]interface{}); ok {
				inputs := make([]string, len(inputsRaw))
				for i, inp := range inputsRaw {
					if input, ok := inp.(map[string]interface{}); ok {
						if name, ok := input["inputName"].(string); ok {
							inputs[i] = name
						}
					}
				}
				return inputs, nil
			}
		}
		return nil, fmt.Errorf("no data in response")

	case <-time.After(3 * time.Second):
		a.removePendingRequest(requestId)
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

	requestId := fmt.Sprintf("cmd_%d", time.Now().UnixNano())

	requestData := map[string]interface{}{
		"requestType": obsMethod,
		"requestId":   requestId,
	}

	for k, v := range params {
		if method == "Mute" && k == "target" {
			requestData["inputName"] = v
		} else if method == "Scene" && k == "target" {
			requestData["sceneName"] = v
		} else if method == "Visibility" && k == "target" {
			requestData["sceneItemId"] = v
		} else if method == "Filter" && k == "target" {
			requestData["sourceName"] = v
		} else {
			requestData[k] = v
		}
	}

	request := map[string]interface{}{
		"op": 6,
		"d":  requestData,
	}

	requestJSON, _ := json.Marshal(request)
	fmt.Printf("[OBS] Sending: %s\n", string(requestJSON))

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
