export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ 
        status: "ok", 
        timestamp: Date.now(),
        rooms: roomManager.size 
      }), {
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
}

const roomManager = new Map<string, SocketState>()

function handleWebSocket(request: Request): Response {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")?.toUpperCase() || ""
  const role = url.searchParams.get("role") || "client"

  if (code.length < 4) {
    return new Response("Invalid code", { status: 400 })
  }

  try {
    const pair = new WebSocketPair()
    const [clientSocket, serverSocket] = [pair[0], pair[1]]

    serverSocket.accept()
    console.log(`[Worker] Connected: ${code} (${role})`)

    const state: SocketState = { socket: serverSocket, joinCode: code, role }

    serverSocket.addEventListener("message", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data as string)
        console.log(`[Worker] ${code}: ${data.type}`)

        if (data.type === "register") {
          const regCode = (data.code || code).toUpperCase()
          const regRole = data.role || role
          
          state.joinCode = regCode
          state.role = regRole

          const peer = roomManager.get(regCode)

          if (peer) {
            if (regRole === "host" && peer.role === "host") {
              serverSocket.send(JSON.stringify({ type: "error", message: "Host exists" }))
              return
            }

            console.log(`[Worker] Pairing: ${regCode}`)

            peer.socket.addEventListener("message", (ev: MessageEvent) => {
              try { state.socket.send(ev.data) } catch {}
            })
            state.socket.addEventListener("message", (ev: MessageEvent) => {
              try { peer.socket.send(ev.data) } catch {}
            })

            serverSocket.send(JSON.stringify({ type: "connected", code: regCode }))
            peer.socket.send(JSON.stringify({ type: "peer_connected", code: regCode }))

            roomManager.set(regCode, state)
            console.log(`[Worker] SUCCESS: ${regCode}`)
          } else {
            roomManager.set(regCode, state)
            serverSocket.send(JSON.stringify({ type: "waiting", code: regCode }))
            console.log(`[Worker] Waiting: ${regCode}`)
          }
        }
      } catch (err) {
        console.log(`[Worker] Error: ${err}`)
      }
    })

    serverSocket.addEventListener("close", () => {
      console.log(`[Worker] Disconnected: ${code}`)
      if (roomManager.get(code) === state) {
        roomManager.delete(code)
      }
    })

    return new Response(null, { status: 101, webSocket: clientSocket })

  } catch (error) {
    console.error(`[Worker] Failed: ${error}`)
    return new Response("Error", { status: 500 })
  }
}
