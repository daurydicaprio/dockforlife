package server

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/daury/dockforlife-proxy/internal/adapter"
	"github.com/daury/dockforlife-proxy/internal/config"
	"github.com/daury/dockforlife-proxy/internal/contract"
	"github.com/gorilla/websocket"
)

type Client struct {
	conn      *websocket.Conn
	adapter   *adapter.OBSAdapter
	authToken string
	send      chan []byte
	mu        sync.Mutex
}

type Server struct {
	config     *config.Config
	httpServer *http.Server
	adapter    *adapter.OBSAdapter
	clients    map[*Client]bool
	clientsMu  sync.RWMutex
	broadcast  chan []byte
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func NewServer(cfg *config.Config, obsAdapter *adapter.OBSAdapter) *Server {
	return &Server{
		config:    cfg,
		adapter:   obsAdapter,
		clients:   make(map[*Client]bool),
		broadcast: make(chan []byte, 256),
	}
}

func (s *Server) Start() error {
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", s.handleWebSocket)
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/", s.handleIndex)

	s.httpServer = &http.Server{
		Addr:         s.config.ListenAddr(),
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	log.Printf("[PHASE3] Proxy server listening on %s", s.config.ListenAddr())
	return s.httpServer.ListenAndServe()
}

func (s *Server) handleIndex(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	w.Write([]byte("DockForLife OBS Proxy - Phase 3\n\n"))
	w.Write([]byte("WebSocket endpoint: ws://<address>/ws\n"))
	w.Write([]byte("Health check: /health\n"))
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status": "ok", "phase": 3}`))
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[PHASE3] WebSocket upgrade failed: %v", err)
		return
	}

	client := &Client{
		conn:    conn,
		adapter: s.adapter,
		send:    make(chan []byte, 256),
	}

	s.clientsMu.Lock()
	s.clients[client] = true
	s.clientsMu.Unlock()

	log.Printf("[PHASE3] New client connected (total: %d)", len(s.clients))

	go client.writePump()
	go client.readPump(s)
}

func (s *Server) removeClient(client *Client) {
	s.clientsMu.Lock()
	delete(s.clients, client)
	s.clientsMu.Unlock()
	close(client.send)
	log.Printf("[PHASE3] Client disconnected (remaining: %d)", len(s.clients))
}

func (c *Client) readPump(s *Server) {
	defer func() {
		s.removeClient(c)
		c.conn.Close()
	}()

	c.conn.SetReadLimit(512 * 1024)
	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[PHASE3] WebSocket error: %v", err)
			}
			break
		}

		var wsMsg contract.WebSocketMessage
		if err := json.Unmarshal(message, &wsMsg); err != nil {
			log.Printf("[PHASE3] Failed to parse message: %v", err)
			errorMsg, _ := json.Marshal(contract.NewErrorMessage("Invalid message format"))
			c.send <- errorMsg
			continue
		}

		s.handleMessage(c, wsMsg)
	}
}

func (s *Server) handleMessage(c *Client, msg contract.WebSocketMessage) {
	switch msg.Type {
	case contract.MessageTypePing:
		pongMsg, _ := json.Marshal(contract.NewPongMessage())
		c.send <- pongMsg

	case contract.MessageTypeCommand:
		cmdData, err := json.Marshal(msg.Payload)
		if err != nil {
			errorMsg, _ := json.Marshal(contract.NewErrorMessage("Invalid command payload"))
			c.send <- errorMsg
			return
		}

		cmd, err := contract.ParseCommand(cmdData)
		if err != nil {
			errorMsg, _ := json.Marshal(contract.NewErrorMessage("Failed to parse command"))
			c.send <- errorMsg
			return
		}

		if cmd == nil {
			errorMsg, _ := json.Marshal(contract.NewErrorMessage("Unknown command type"))
			c.send <- errorMsg
			return
		}

		log.Printf("[PHASE3] Executing command: type=%s target=%s filter=%s",
			cmd.GetType(), getTarget(cmd), getFilter(cmd))

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		result := c.adapter.Execute(ctx, cmd)
		resultMsg, _ := json.Marshal(contract.NewResultMessage(*result))
		c.send <- resultMsg

	default:
		errorMsg, _ := json.Marshal(contract.NewErrorMessage("Unknown message type"))
		c.send <- errorMsg
	}
}

func getTarget(cmd contract.Command) string {
	switch c := cmd.(type) {
	case contract.MuteCommand:
		return c.Target
	case contract.SceneCommand:
		return c.Target
	case contract.VisibilityCommand:
		return c.Target
	case contract.FilterCommand:
		return c.Target
	}
	return ""
}

func getFilter(cmd contract.Command) string {
	if c, ok := cmd.(contract.FilterCommand); ok {
		return c.Filter
	}
	return ""
}

func (c *Client) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (s *Server) Shutdown() error {
	if s.httpServer != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return s.httpServer.Shutdown(ctx)
	}
	return nil
}
