export interface Env {
  RELAY_SESSION: DurableObjectNamespace
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json" }
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
          console.log(`[Relay] ${this.code} received: ${msgType}`)

          if (msgType === "register") {
            if (isHost) {
              this.hostRegistered = true
            } else {
              this.clientRegistered = true
            }

            const peer = isHost ? this.clientSocket : this.hostSocket

            if (peer && (this.hostRegistered && this.clientRegistered)) {
              serverSocket.send(JSON.stringify({ type: "peer_connected" }))
              peer.send(JSON.stringify({ type: "peer_connected" }))
              console.log(`[Relay] PAIRED: ${this.code}`)
            } else {
              serverSocket.send(JSON.stringify({ type: "waiting" }))
              console.log(`[Relay] Waiting: ${this.code} (host:${this.hostRegistered} client:${this.clientRegistered})`)
            }
            return
          }

          if (msgType === "request_update") {
            const peer = isHost ? this.clientSocket : this.hostSocket
            if (peer && peer.readyState === WebSocket.OPEN) {
              peer.send(data)
              console.log(`[Relay] Forwarded request_update`)
            }
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
