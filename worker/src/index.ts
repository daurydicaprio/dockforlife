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

    try {
      const pair = new WebSocketPair()
      const [clientSocket, serverSocket] = [pair[0], pair[1]]

      serverSocket.accept()

      if (role === "host") {
        this.hostSocket = serverSocket
      } else {
        this.clientSocket = serverSocket
      }

      serverSocket.addEventListener("message", (e: MessageEvent) => {
        try {
          const data = e.data as string
          const peer = role === "host" ? this.clientSocket : this.hostSocket

          if (peer && peer.readyState === WebSocket.OPEN) {
            peer.send(data)
          }
        } catch (err) {
          console.log(`[Relay] Forward error: ${err}`)
        }
      })

      serverSocket.addEventListener("close", () => {
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
