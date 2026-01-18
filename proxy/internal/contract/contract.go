package contract

import (
	"encoding/json"
	"time"
)

const ContractVersion = "1.0.0"

type CommandType string

const (
	CommandTypeMute       CommandType = "mute"
	CommandTypeScene      CommandType = "scene"
	CommandTypeRecord     CommandType = "record"
	CommandTypeStream     CommandType = "stream"
	CommandTypeVisibility CommandType = "visibility"
	CommandTypeFilter     CommandType = "filter"
)

type BaseCommand struct {
	Type      CommandType `json:"type"`
	Target    string      `json:"target,omitempty"`
	Filter    string      `json:"filter,omitempty"`
	Timestamp int64       `json:"timestamp"`
}

type MuteCommand struct {
	BaseCommand
	Type   CommandType `json:"type"`
	Target string      `json:"target"`
}

type SceneCommand struct {
	BaseCommand
	Type   CommandType `json:"type"`
	Target string      `json:"target"`
}

type RecordCommand struct {
	BaseCommand
	Type CommandType `json:"type"`
}

type StreamCommand struct {
	BaseCommand
	Type CommandType `json:"type"`
}

type VisibilityCommand struct {
	BaseCommand
	Type   CommandType `json:"type"`
	Target string      `json:"target"`
	Value  *bool       `json:"value,omitempty"`
}

type FilterCommand struct {
	BaseCommand
	Type   CommandType `json:"type"`
	Target string      `json:"target"`
	Filter string      `json:"filter"`
	Value  *bool       `json:"value,omitempty"`
}

type Command interface {
	GetType() CommandType
	GetTimestamp() int64
}

func (c MuteCommand) GetType() CommandType { return c.Type }
func (c MuteCommand) GetTimestamp() int64  { return c.Timestamp }

func (c SceneCommand) GetType() CommandType { return c.Type }
func (c SceneCommand) GetTimestamp() int64  { return c.Timestamp }

func (c RecordCommand) GetType() CommandType { return c.Type }
func (c RecordCommand) GetTimestamp() int64  { return c.Timestamp }

func (c StreamCommand) GetType() CommandType { return c.Type }
func (c StreamCommand) GetTimestamp() int64  { return c.Timestamp }

func (c VisibilityCommand) GetType() CommandType { return c.Type }
func (c VisibilityCommand) GetTimestamp() int64  { return c.Timestamp }

func (c FilterCommand) GetType() CommandType { return c.Type }
func (c FilterCommand) GetTimestamp() int64  { return c.Timestamp }

type CommandResult struct {
	Success   bool    `json:"success"`
	Command   Command `json:"command"`
	Error     string  `json:"error,omitempty"`
	Timestamp int64   `json:"timestamp"`
}

func NewCommandResult(success bool, cmd Command, errMsg string) CommandResult {
	return CommandResult{
		Success:   success,
		Command:   cmd,
		Error:     errMsg,
		Timestamp: time.Now().UnixMilli(),
	}
}

type SceneInfo struct {
	SceneName string `json:"sceneName"`
}

type InputInfo struct {
	InputName string `json:"inputName"`
	InputKind string `json:"inputKind"`
}

type SourceFilterInfo struct {
	FilterName     string                 `json:"filterName"`
	FilterEnabled  bool                   `json:"filterEnabled"`
	FilterType     string                 `json:"filterType"`
	FilterSettings map[string]interface{} `json:"filterSettings"`
}

type SceneItemInfo struct {
	SceneItemId      int    `json:"sceneItemId"`
	SourceName       string `json:"sourceName"`
	SceneItemEnabled bool   `json:"sceneItemEnabled"`
}

type OBSData struct {
	Scenes     []SceneInfo `json:"scenes"`
	Inputs     []InputInfo `json:"inputs"`
	AllSources []string    `json:"allSources"`
	Rec        bool        `json:"rec"`
	Str        bool        `json:"str"`
}

func ParseCommand(data json.RawMessage) (Command, error) {
	var base BaseCommand
	if err := json.Unmarshal(data, &base); err != nil {
		return nil, err
	}

	switch base.Type {
	case CommandTypeMute:
		var cmd MuteCommand
		if err := json.Unmarshal(data, &cmd); err != nil {
			return nil, err
		}
		return cmd, nil
	case CommandTypeScene:
		var cmd SceneCommand
		if err := json.Unmarshal(data, &cmd); err != nil {
			return nil, err
		}
		return cmd, nil
	case CommandTypeRecord:
		var cmd RecordCommand
		if err := json.Unmarshal(data, &cmd); err != nil {
			return nil, err
		}
		return cmd, nil
	case CommandTypeStream:
		var cmd StreamCommand
		if err := json.Unmarshal(data, &cmd); err != nil {
			return nil, err
		}
		return cmd, nil
	case CommandTypeVisibility:
		var cmd VisibilityCommand
		if err := json.Unmarshal(data, &cmd); err != nil {
			return nil, err
		}
		return cmd, nil
	case CommandTypeFilter:
		var cmd FilterCommand
		if err := json.Unmarshal(data, &cmd); err != nil {
			return nil, err
		}
		return cmd, nil
	default:
		return nil, nil
	}
}

func IsCommandType(value string) bool {
	switch CommandType(value) {
	case CommandTypeMute, CommandTypeScene, CommandTypeRecord, CommandTypeStream,
		CommandTypeVisibility, CommandTypeFilter:
		return true
	}
	return false
}

func ValidateCommand(cmd Command) (bool, string) {
	switch c := cmd.(type) {
	case MuteCommand:
		if c.Target == "" {
			return false, "Mute command requires non-empty target"
		}
	case SceneCommand:
		if c.Target == "" {
			return false, "Scene command requires non-empty target"
		}
	case VisibilityCommand:
		if c.Target == "" {
			return false, "Visibility command requires non-empty target"
		}
	case FilterCommand:
		if c.Target == "" {
			return false, "Filter command requires non-empty target"
		}
		if c.Filter == "" {
			return false, "Filter command requires non-empty filter name"
		}
	}
	return true, ""
}

type MessageType string

const (
	MessageTypeCommand     MessageType = "command"
	MessageTypeResult      MessageType = "result"
	MessageTypeSubscribe   MessageType = "subscribe"
	MessageTypeUnsubscribe MessageType = "unsubscribe"
	MessageTypePing        MessageType = "ping"
	MessageTypePong        MessageType = "pong"
	MessageTypeError       MessageType = "error"
)

type WebSocketMessage struct {
	Type    MessageType `json:"type"`
	Payload interface{} `json:"payload,omitempty"`
}

func NewCommandMessage(cmd Command) WebSocketMessage {
	return WebSocketMessage{
		Type:    MessageTypeCommand,
		Payload: cmd,
	}
}

func NewResultMessage(result CommandResult) WebSocketMessage {
	return WebSocketMessage{
		Type:    MessageTypeResult,
		Payload: result,
	}
}

func NewPingMessage() WebSocketMessage {
	return WebSocketMessage{Type: MessageTypePing}
}

func NewPongMessage() WebSocketMessage {
	return WebSocketMessage{Type: MessageTypePong}
}

func NewErrorMessage(err string) WebSocketMessage {
	return WebSocketMessage{
		Type:    MessageTypeError,
		Payload: map[string]string{"error": err},
	}
}
