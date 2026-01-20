interface Env {}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json" }
      })
    }

    if (request.headers.get("Upgrade") === "websocket") {
      return handleWebSocket(request)
    }

    return new Response("Expected WebSocket", { status: 426 })
  }
}

interface SocketState {
  socket: WebSocket
  joinCode: string
  role: string
  ip: string
  connectedAt: number
}

function normalizeCode(code: string): string {
  return code.toUpperCase().trim()
}

function sanitizeLog(data: string): string {
  return data.replace(/[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/g, "[IP_REDACTED]")
}

function handleWebSocket(request: Request): Response {
  const url = new URL(request.url)
  let code = normalizeCode(url.searchParams.get("code") || "")
  const role = url.searchParams.get("role") || "client"

  if (!code || !isValidCode(code)) {
    return new Response("Invalid code", { status: 400 })
  }

  try {
    const pair = new WebSocketPair()
    const [clientSocket, serverSocket] = [pair[0], pair[1]]
    serverSocket.accept()

    const state: SocketState = {
      socket: serverSocket,
      joinCode: code,
      role: role,
      ip: "[REDACTED]",
      connectedAt: Date.now(),
    }

    serverSocket.addEventListener("message", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data as string)

        if (data.type === "register") {
          state.joinCode = normalizeCode(data.code || data.joinCode || code)
          state.role = data.role || role

          const peer = roomManager.get(state.joinCode)

          if (peer) {
            if (state.role === "host" && peer.role === "host") {
              serverSocket.send(JSON.stringify({ type: "error", message: "Host exists" }))
              serverSocket.close()
              return
            }

            peer.socket.addEventListener("message", (ev: MessageEvent) => {
              try { state.socket.send(ev.data) } catch {}
            })
            state.socket.addEventListener("message", (ev: MessageEvent) => {
              try { peer.socket.send(ev.data) } catch {}
            })

            state.socket.send(JSON.stringify({ type: "peer_connected" }))
            peer.socket.send(JSON.stringify({ type: "peer_connected" }))
            state.socket.send(JSON.stringify({ type: "connected", code: state.joinCode }))

            roomManager.set(state.joinCode, state)
          } else {
            roomManager.set(state.joinCode, state)
            serverSocket.send(JSON.stringify({ type: "waiting", code: state.joinCode }))
          }
          return
        }

        if (state.role !== "host") {
          const peer = roomManager.get(state.joinCode)
          if (peer) {
            peer.socket.send(e.data)
          }
        }
      } catch (err) {}
    })

    serverSocket.addEventListener("close", () => {
      if (roomManager.get(state.joinCode) === state) {
        roomManager.delete(state.joinCode)
      }
    })

    return new Response(null, { status: 101, webSocket: serverSocket })

  } catch (error) {
    return new Response("Error", { status: 500 })
  }
}

function isValidCode(code: string): boolean {
  return /^[A-Za-z0-9]{4,12}$/.test(code)
}

const roomManager = new Map<string, SocketState>()
