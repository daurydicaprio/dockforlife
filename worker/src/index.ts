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

function sanitizeLog(data: string): string {
  return data.replace(/[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/g, "[IP_REDACTED]")
}

function isValidCode(code: string): boolean {
  return /^[A-Za-z0-9]{4,12}$/.test(code)
}

const roomManager = new Map<string, SocketState>()

function handleWebSocket(request: Request): Response {
  const url = new URL(request.url)
  let code = normalizeCode(url.searchParams.get("code") || "")
  const role = url.searchParams.get("role") || "client"

  console.log(`[Worker] New WebSocket: code=${code}, role=${role}`)

  if (!code) {
    console.log(`[Worker] Invalid: no code`)
    return new Response("Invalid code: code is required", { status: 400 })
  }

  if (!isValidCode(code)) {
    console.log(`[Worker] Invalid code format: ${code}`)
    return new Response("Invalid code format (4-12 alphanumeric chars)", { status: 400 })
  }

  try {
    const pair = new WebSocketPair()
    const [clientSocket, serverSocket] = [pair[0], pair[1]]
    
    serverSocket.accept()
    console.log(`[Worker] Accepted: code=${code}`)

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
        const sanitized = sanitizeLog(rawData.substring(0, 200))
        console.log(`[Worker] Msg(${code}): ${sanitized}`)

        const data = JSON.parse(rawData)

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

            state.socket.send(JSON.stringify({ type: "peer_connected", code: state.joinCode }))
            peer.socket.send(JSON.stringify({ type: "peer_connected", code: state.joinCode }))
            state.socket.send(JSON.stringify({ type: "connected", code: state.joinCode }))

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
          console.log(`[Worker] Ping: ${code}`)
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
        console.log(`[Worker] Parse error: ${err}`)
      }
    })

    serverSocket.addEventListener("close", () => {
      if (roomManager.get(state.joinCode) === state) {
        console.log(`[Worker] Cleanup: ${state.joinCode}`)
        roomManager.delete(state.joinCode)
      }
    })

    return new Response(null, { status: 101, webSocket: serverSocket })

  } catch (error) {
    console.error(`[Worker] Setup failed: ${error}`)
    return new Response("Internal error", { status: 500 })
  }
}
