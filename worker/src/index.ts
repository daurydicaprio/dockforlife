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

    if (url.pathname === "/metrics") {
      return new Response(JSON.stringify({
        status: "ok",
        activeRooms: roomManager.size,
        timestamp: Date.now()
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
  ip: string
  connectedAt: number
}

function normalizeCode(code: string): string {
  return code.toUpperCase().trim().replace(/[^A-Z0-9]/g, '')
}

function isValidCode(code: string): boolean {
  return /^[A-Za-z0-9]{4,12}$/.test(code)
}

const roomManager = new Map<string, SocketState>()

function handleWebSocket(request: Request): Response {
  const url = new URL(request.url)
  let code = normalizeCode(url.searchParams.get("code") || "")
  const role = url.searchParams.get("role") || "client"

  console.log(`[Worker] Incoming: code=${code}, role=${role}`)

  if (!code || !isValidCode(code)) {
    console.log(`[Worker] Invalid code: ${code}`)
    return new Response("Invalid code", { status: 400 })
  }

  try {
    const pair = new WebSocketPair()
    const [clientSocket, serverSocket] = [pair[0], pair[1]]

    serverSocket.accept()
    console.log(`[Worker] Socket accepted: code=${code}, role=${role}`)

    const state: SocketState = {
      socket: serverSocket,
      joinCode: code,
      role: role,
      ip: "[REDACTED]",
      connectedAt: Date.now(),
    }

    serverSocket.addEventListener("message", (e: MessageEvent) => {
      try {
        const rawData = e.data as string
        console.log(`[Worker] Raw message: ${rawData.substring(0, 100)}`)

        const data = JSON.parse(rawData)
        console.log(`[Worker] Parsed: type=${data.type}, code=${data.code || code}`)

        if (data.type === "register") {
          state.joinCode = normalizeCode(data.code || data.joinCode || code)
          state.role = data.role || role
          
          console.log(`[Worker] Register: code=${state.joinCode}, role=${state.role}`)

          const peer = roomManager.get(state.joinCode)

          if (peer) {
            if (state.role === "host" && peer.role === "host") {
              console.log(`[Worker] Reject: host exists`)
              serverSocket.send(JSON.stringify({ type: "error", message: "Host already exists" }))
              serverSocket.close(4001, "Host exists")
              return
            }

            console.log(`[Worker] Pairing: ${state.joinCode}`)

            peer.socket.addEventListener("message", (ev: MessageEvent) => {
              try { state.socket.send(ev.data) } catch {}
            })
            state.socket.addEventListener("message", (ev: MessageEvent) => {
              try { peer.socket.send(ev.data) } catch {}
            })

            const response = JSON.stringify({ type: "peer_connected", code: state.joinCode })
            serverSocket.send(response)
            peer.socket.send(response)
            
            roomManager.set(state.joinCode, state)
            console.log(`[Worker] SUCCESS: paired for ${state.joinCode}`)
          } else {
            roomManager.set(state.joinCode, state)
            serverSocket.send(JSON.stringify({ type: "waiting", code: state.joinCode }))
            console.log(`[Worker] Waiting for peer: ${state.joinCode}`)
          }
          return
        }

        if (data.type === "ping") {
          serverSocket.send(JSON.stringify({ type: "pong" }))
          return
        }

        if (data.type === "obs_event") {
          const peer = roomManager.get(state.joinCode)
          if (peer && peer !== state) {
            peer.socket.send(e.data)
          }
          return
        }

        if (state.role !== "host") {
          const peer = roomManager.get(state.joinCode)
          if (peer) {
            peer.socket.send(e.data)
          }
        }
      } catch (err) {
        console.log(`[Worker] Error: ${err}`)
      }
    })

    serverSocket.addEventListener("close", () => {
      console.log(`[Worker] Close: ${state.joinCode}`)
      if (roomManager.get(state.joinCode) === state) {
        roomManager.delete(state.joinCode)
      }
    })

    return new Response(null, { status: 101, webSocket: clientSocket })

  } catch (error) {
    console.error(`[Worker] Setup failed: ${error}`)
    return new Response("Error", { status: 500 })
  }
}
