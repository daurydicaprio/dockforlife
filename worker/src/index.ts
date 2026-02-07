export interface Env {
  RELAY_SESSION: DurableObjectNamespace
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      })
    }

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*" 
        }
      })
    }

    if (request.headers.get("Upgrade") === "websocket") {
      const code = url.searchParams.get("code")?.toUpperCase() || ""
      const role = url.searchParams.get("role") || "client"

      if (code.length < 4) {
        return new Response("Invalid code", { status: 400 })
      }

      const id = env.RELAY_SESSION.idFromName(code)
      const stub = env.RELAY_SESSION.get(id)

      return stub.fetch(request)
    }

    return new Response("Expected WebSocket", { status: 426 })
  }
}

export class RelaySession {
  private hostSocket: WebSocket | null = null
  private clientSocket: WebSocket | null = null
  private hostRegistered = false
  private clientRegistered = false
  private code: string = ""

  constructor(private state: DurableObjectState) {}

  private broadcastToAll(data: string, excludeSelf: WebSocket | null = null) {
    const sentTo: string[] = [];
    
    if (this.hostSocket && this.hostSocket !== excludeSelf && this.hostSocket.readyState === WebSocket.OPEN) {
      this.hostSocket.send(data);
      sentTo.push('host');
    }
    
    if (this.clientSocket && this.clientSocket !== excludeSelf && this.clientSocket.readyState === WebSocket.OPEN) {
      this.clientSocket.send(data);
      sentTo.push('client');
    }
    
    if (sentTo.length > 0) {
      console.log(`[Relay] ${this.code} broadcast to: ${sentTo.join(', ')}`);
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    this.code = url.searchParams.get("code")?.toUpperCase() || ""
    const role = url.searchParams.get("role") || "client"

    try {
      const pair = new WebSocketPair()
      const [clientSocket, serverSocket] = [pair[0], pair[1]]

      serverSocket.accept()

      const isHost = role === "host"
      
      if (isHost) {
        this.hostSocket = serverSocket
      } else {
        this.clientSocket = serverSocket
      }

      serverSocket.addEventListener("message", (e: MessageEvent) => {
        try {
          const data = e.data as string
          const parsed = JSON.parse(data)

          const msgType = parsed.type || "unknown"
          console.log(`[Relay] ${this.code} received: ${msgType} (${role})`)

          if (msgType === "register") {
            if (isHost) {
              this.hostRegistered = true
            } else {
              this.clientRegistered = true
            }

            if (this.hostRegistered && this.clientRegistered) {
              const pairMsg = JSON.stringify({ type: "peer_connected" })
              this.hostSocket?.send(pairMsg)
              this.clientSocket?.send(pairMsg)
              console.log(`[Relay] PAIRED: ${this.code}`)
            } else {
              serverSocket.send(JSON.stringify({ type: "waiting" }))
              console.log(`[Relay] Waiting: ${this.code} (host:${this.hostRegistered} client:${this.clientRegistered})`)
            }
            return
          }

          if (msgType === "request_full_sync") {
            if (isHost && this.hostSocket) {
              console.log(`[Relay] ${this.code} requesting full_sync from host`);
            }
            return
          }

          if (msgType === "full_sync") {
            console.log(`[Relay] ${this.code} broadcasting full_sync to clients`);
            this.broadcastToAll(data, isHost ? this.hostSocket : this.clientSocket);
            return
          }

          if (msgType === "obs_event") {
            console.log(`[Relay] ${this.code} broadcasting obs_event: ${parsed.eventType}`);
            this.broadcastToAll(data, isHost ? this.hostSocket : this.clientSocket);
            return
          }

          if (msgType === "obs_data") {
            const peer = isHost ? this.clientSocket : this.hostSocket
            if (peer && peer.readyState === WebSocket.OPEN) {
              peer.send(data)
              console.log(`[Relay] Forwarded obs_data (${parsed.scenes?.length || 0} scenes)`)
            }
            return
          }

          if (msgType === "obs_status") {
            const peer = isHost ? this.clientSocket : this.hostSocket
            if (peer && peer.readyState === WebSocket.OPEN) {
              peer.send(data)
              console.log(`[Relay] Forwarded obs_status`)
            }
            return
          }

          if (msgType === "obs_command" || msgType === "ping" || msgType === "pong") {
            const peer = isHost ? this.clientSocket : this.hostSocket
            if (peer && peer.readyState === WebSocket.OPEN) {
              peer.send(data)
              console.log(`[Relay] Forwarded ${msgType}`)
            }
            return
          }

          if (this.hostRegistered && this.clientRegistered) {
            const peer = isHost ? this.clientSocket : this.hostSocket
            if (peer && peer.readyState === WebSocket.OPEN) {
              peer.send(data)
              console.log(`[Relay] Forwarded ${msgType}`)
            }
          }
        } catch (err) {
          console.log(`[Relay] Error: ${err}`)
        }
      })

      serverSocket.addEventListener("close", () => {
        console.log(`[Relay] Disconnected: ${this.code} (${role})`)
        if (isHost) {
          this.hostSocket = null
          this.hostRegistered = false
        } else {
          this.clientSocket = null
          this.clientRegistered = false
        }
      })

      return new Response(null, { status: 101, webSocket: clientSocket })

    } catch (error) {
      console.error(`[Relay] Failed: ${error}`)
      return new Response("Error", { status: 500 })
    }
  }
}
