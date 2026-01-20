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
  private code: string = ""

  constructor(private state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    this.code = url.searchParams.get("code")?.toUpperCase() || ""
    const role = url.searchParams.get("role") || "client"

    console.log(`[Relay] Incoming: ${this.code} (${role})`)

    try {
      const pair = new WebSocketPair()
      const [clientSocket, serverSocket] = [pair[0], pair[1]]

      serverSocket.accept()
      console.log(`[Relay] Connected: ${this.code} (${role})`)

      if (role === "host") {
        this.hostSocket = serverSocket
        console.log(`[Relay] Host registered: ${this.code}`)
      } else {
        this.clientSocket = serverSocket
        console.log(`[Relay] Client registered: ${this.code}`)
      }

      serverSocket.addEventListener("message", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data as string)
          console.log(`[Relay] ${this.code}: ${data.type}`)

          if (data.type === "register") {
            if (role === "host" && this.clientSocket) {
              this.clientSocket.send(JSON.stringify({ type: "connected", code: this.code }))
              this.hostSocket?.send(JSON.stringify({ type: "peer_connected", code: this.code }))
              console.log(`[Relay] SUCCESS: ${this.code}`)
            } else if (this.hostSocket) {
              this.hostSocket.send(JSON.stringify({ type: "connected", code: this.code }))
              this.clientSocket?.send(JSON.stringify({ type: "peer_connected", code: this.code }))
              console.log(`[Relay] SUCCESS: ${this.code}`)
            } else {
              serverSocket.send(JSON.stringify({ type: "waiting", code: this.code }))
              console.log(`[Relay] Waiting: ${this.code}`)
            }
          }
        } catch (err) {
          console.log(`[Relay] Error: ${err}`)
        }
      })

      serverSocket.addEventListener("close", () => {
        console.log(`[Relay] Disconnected: ${this.code}`)
        if (role === "host") {
          this.hostSocket = null
        } else {
          this.clientSocket = null
        }
      })

      return new Response(null, { status: 101, webSocket: clientSocket })

    } catch (error) {
      console.error(`[Relay] Failed: ${error}`)
      return new Response("Error", { status: 500 })
    }
  }
}
