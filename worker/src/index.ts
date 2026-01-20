interface Env {}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        }
      })
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }
      })
    }

    const upgrade = request.headers.get("Upgrade")
    if (upgrade === "websocket") {
      return handleWebSocket(request)
    }

    return new Response("Expected WebSocket upgrade", { status: 426 })
  }
}

interface SocketState {
  socket: WebSocket
  joinCode: string
  role: string
  registered: boolean
  ip: string
  connectedAt: number
}

function normalizeCode(code: string): string {
  return code.toUpperCase().trim()
}

function handleWebSocket(request: Request): Response {
  const url = new URL(request.url)
  let joinCode = url.searchParams.get("code") || ""
  const role = url.searchParams.get("role") || "client"

  joinCode = normalizeCode(joinCode)

  if (!joinCode || !isValidCode(joinCode)) {
    return new Response("Invalid join code", { status: 400 })
  }

  const clientIp = request.headers.get("CF-Connecting-IP") || "unknown"

  try {
    const pair = new WebSocketPair()
    const [clientSocket, serverSocket] = [pair[0], pair[1]]
    serverSocket.accept()

    const state: SocketState = {
      socket: serverSocket,
      joinCode: joinCode,
      role: role,
      registered: false,
      ip: clientIp,
      connectedAt: Date.now(),
    }

    serverSocket.addEventListener("message", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data as string)

        if (data.type === "register") {
          const regCode = normalizeCode(data.code || data.joinCode || joinCode)
          state.joinCode = regCode
          state.role = data.role || role
          state.registered = true

          const existingPeer = roomManager.get(state.joinCode)
          
          if (existingPeer) {
            if (state.role === "host" && existingPeer.role === "host") {
              serverSocket.send(JSON.stringify({ type: "error", message: "Host already exists" }))
              serverSocket.close()
              return
            }

            state.socket.addEventListener("message", (ev: MessageEvent) => {
              try { existingPeer.socket.send(ev.data) } catch {}
            })
            existingPeer.socket.addEventListener("message", (ev: MessageEvent) => {
              try { state.socket.send(ev.data) } catch {}
            })

            const msg = JSON.stringify({ type: "peer_connected" })
            state.socket.send(msg)
            existingPeer.socket.send(msg)

            state.socket.send(JSON.stringify({ type: "connected", joinCode: state.joinCode }))
          } else {
            roomManager.set(state.joinCode, state)
            serverSocket.send(JSON.stringify({ type: "waiting", joinCode: state.joinCode }))
          }
          return
        }

        const targetCode = state.registered ? state.joinCode : joinCode
        const peer = roomManager.get(targetCode)
        
        if (peer && peer !== state) {
          peer.socket.send(e.data)
        }
      } catch (err) {
        console.error("Message error:", err)
      }
    })

    serverSocket.addEventListener("close", () => {
      if (state.registered && roomManager.get(state.joinCode) === state) {
        roomManager.delete(state.joinCode)
      }
    })

    return new Response(null, { status: 101, webSocket: serverSocket })

  } catch (error) {
    console.error("WebSocket error:", error)
    return new Response("Internal Server Error", { status: 500 })
  }
}

function isValidCode(code: string): boolean {
  return /^[A-Za-z0-9]{4,12}$/.test(code)
}

const roomManager = new Map<string, SocketState>()
