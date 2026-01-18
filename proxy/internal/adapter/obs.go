package adapter

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/daury/dockforlife-proxy/internal/contract"

	"github.com/gorilla/websocket"
)

type OBSAdapter struct {
	conn         *websocket.Conn
	mu           sync.RWMutex
	requestID    int
	currentScene string
}

func NewOBSAdapter(wsURL string, password string) (*OBSAdapter, error) {
	log.Printf("[PHASE3] Connecting to OBS at %s", wsURL)

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to OBS: %w", err)
	}

	if password != "" {
		authMsg := map[string]interface{}{
			"requestType":    "Identify",
			"requestId":      "auth",
			"authentication": generateAuthString(password),
			"rpcVersion":     1,
		}
		if err := conn.WriteJSON(authMsg); err != nil {
			conn.Close()
			return nil, fmt.Errorf("failed to authenticate: %w", err)
		}
	}

	adapter := &OBSAdapter{
		conn: conn,
	}

	go adapter.readLoop()

	if err := adapter.getCurrentScene(); err != nil {
		log.Printf("[PHASE3] Warning: Could not get initial scene: %v", err)
	}

	log.Println("[PHASE3] Connected to OBS")
	return adapter, nil
}

func generateAuthString(password string) string {
	return password
}

func (a *OBSAdapter) readLoop() {
	for {
		_, message, err := a.conn.ReadMessage()
		if err != nil {
			log.Printf("[PHASE3] OBS connection error: %v", err)
			return
		}

		var data map[string]interface{}
		if err := json.Unmarshal(message, &data); err != nil {
			log.Printf("[PHASE3] Failed to parse OBS message: %v", err)
			continue
		}

		if eventType, ok := data["eventType"].(string); ok {
			switch eventType {
			case "CurrentProgramSceneChanged":
				if sceneName, ok := data["eventData"].(map[string]interface{})["sceneName"].(string); ok {
					a.mu.Lock()
					a.currentScene = sceneName
					a.mu.Unlock()
					log.Printf("[PHASE3] Scene changed to: %s", sceneName)
				}
			case "RecordStateChanged":
				log.Printf("[PHASE3] Record state changed")
			case "StreamStateChanged":
				log.Printf("[PHASE3] Stream state changed")
			}
		}
	}
}

func (a *OBSAdapter) Execute(ctx context.Context, cmd contract.Command) *contract.CommandResult {
	a.mu.RLock()
	defer a.mu.RUnlock()

	valid, reason := contract.ValidateCommand(cmd)
	if !valid {
		return &contract.CommandResult{
			Success:   false,
			Command:   cmd,
			Error:     reason,
			Timestamp: time.Now().UnixMilli(),
		}
	}

	var err error
	var result bool

	switch c := cmd.(type) {
	case contract.MuteCommand:
		err = a.toggleMute(c.Target)
		result = err == nil
	case contract.SceneCommand:
		err = a.setScene(c.Target)
		result = err == nil
	case contract.RecordCommand:
		err = a.toggleRecord()
		result = err == nil
	case contract.StreamCommand:
		err = a.toggleStream()
		result = err == nil
	case contract.VisibilityCommand:
		result, err = a.toggleVisibility(c.Target)
	case contract.FilterCommand:
		err = a.toggleFilter(c.Target, c.Filter)
		result = err == nil
	default:
		return &contract.CommandResult{
			Success:   false,
			Command:   cmd,
			Error:     "Unknown command type",
			Timestamp: time.Now().UnixMilli(),
		}
	}

	if err != nil {
		return &contract.CommandResult{
			Success:   false,
			Command:   cmd,
			Error:     err.Error(),
			Timestamp: time.Now().UnixMilli(),
		}
	}

	return &contract.CommandResult{
		Success:   result,
		Command:   cmd,
		Timestamp: time.Now().UnixMilli(),
	}
}

func (a *OBSAdapter) sendRequest(requestType string, requestData map[string]interface{}) (json.RawMessage, error) {
	a.mu.Lock()
	a.requestID++
	requestID := fmt.Sprintf("req-%d", a.requestID)
	a.mu.Unlock()

	request := map[string]interface{}{
		"requestType": requestType,
		"requestId":   requestID,
	}
	for k, v := range requestData {
		request[k] = v
	}

	if err := a.conn.WriteJSON(request); err != nil {
		return nil, err
	}

	timeout := 5 * time.Second
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	type responseWrapper struct {
		requestId string
		data      json.RawMessage
	}
	ch := make(chan responseWrapper, 1)

	go func() {
		_, message, err := a.conn.ReadMessage()
		if err != nil {
			ch <- responseWrapper{}
			return
		}
		var resp map[string]interface{}
		if err := json.Unmarshal(message, &resp); err != nil {
			ch <- responseWrapper{}
			return
		}
		if rid, ok := resp["requestId"].(string); ok && rid == requestID {
			ch <- responseWrapper{requestId: rid, data: json.RawMessage(message)}
		}
	}()

	select {
	case <-ctx.Done():
		return nil, fmt.Errorf("request timeout")
	case resp := <-ch:
		return resp.data, nil
	}
}

func (a *OBSAdapter) toggleMute(inputName string) error {
	_, err := a.sendRequest("ToggleInputMute", map[string]interface{}{
		"inputName": inputName,
	})
	return err
}

func (a *OBSAdapter) setScene(sceneName string) error {
	a.mu.Lock()
	a.currentScene = sceneName
	a.mu.Unlock()
	_, err := a.sendRequest("SetCurrentProgramScene", map[string]interface{}{
		"sceneName": sceneName,
	})
	return err
}

func (a *OBSAdapter) toggleRecord() error {
	_, err := a.sendRequest("ToggleRecord", nil)
	return err
}

func (a *OBSAdapter) toggleStream() error {
	_, err := a.sendRequest("ToggleStream", nil)
	return err
}

func (a *OBSAdapter) toggleVisibility(sourceName string) (bool, error) {
	currentScene := a.getCurrentSceneName()
	if currentScene == "" {
		return false, fmt.Errorf("no current scene")
	}

	itemsResponse, err := a.sendRequest("GetSceneItemList", map[string]interface{}{
		"sceneName": currentScene,
	})
	if err != nil {
		return false, err
	}

	var itemsData struct {
		SceneItems []struct {
			SceneItemId int    `json:"sceneItemId"`
			SourceName  string `json:"sourceName"`
		} `json:"sceneItems"`
	}
	if err := json.Unmarshal(itemsResponse, &itemsData); err != nil {
		return false, err
	}

	var sceneItemId int
	for _, item := range itemsData.SceneItems {
		if item.SourceName == sourceName {
			sceneItemId = item.SceneItemId
			break
		}
	}

	if sceneItemId == 0 {
		return false, fmt.Errorf("source %s not found in scene %s", sourceName, currentScene)
	}

	enabledResponse, err := a.sendRequest("GetSceneItemEnabled", map[string]interface{}{
		"sceneName":   currentScene,
		"sceneItemId": sceneItemId,
	})
	if err != nil {
		return false, err
	}

	var enabledData struct {
		SceneItemEnabled bool `json:"sceneItemEnabled"`
	}
	if err := json.Unmarshal(enabledResponse, &enabledData); err != nil {
		return false, err
	}

	newState := !enabledData.SceneItemEnabled
	_, err = a.sendRequest("SetSceneItemEnabled", map[string]interface{}{
		"sceneName":        currentScene,
		"sceneItemId":      sceneItemId,
		"sceneItemEnabled": newState,
	})
	return newState, err
}

func (a *OBSAdapter) toggleFilter(sourceName string, filterName string) error {
	filterResponse, err := a.sendRequest("GetSourceFilter", map[string]interface{}{
		"sourceName": sourceName,
		"filterName": filterName,
	})
	if err != nil {
		return err
	}

	var filterData struct {
		FilterEnabled bool `json:"filterEnabled"`
	}
	if err := json.Unmarshal(filterResponse, &filterData); err != nil {
		return err
	}

	newState := !filterData.FilterEnabled
	_, err = a.sendRequest("SetSourceFilterEnabled", map[string]interface{}{
		"sourceName":    sourceName,
		"filterName":    filterName,
		"filterEnabled": newState,
	})
	return err
}

func (a *OBSAdapter) getCurrentScene() error {
	resp, err := a.sendRequest("GetCurrentProgramScene", nil)
	if err != nil {
		return err
	}

	var data struct {
		CurrentProgramSceneName string `json:"currentProgramSceneName"`
	}
	if err := json.Unmarshal(resp, &data); err != nil {
		return err
	}

	a.mu.Lock()
	a.currentScene = data.CurrentProgramSceneName
	a.mu.Unlock()

	return nil
}

func (a *OBSAdapter) getCurrentSceneName() string {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.currentScene
}

func (a *OBSAdapter) Close() error {
	if a.conn != nil {
		return a.conn.Close()
	}
	return nil
}
