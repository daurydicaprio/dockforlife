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

    if (url.pathname === "/ws" || url.pathname === "/") {
      const upgrade = request.headers.get("Upgrade")
      console.log(`[Worker] Incoming request: ${request.method} ${url.pathname}, Upgrade: ${upgrade}`)
      
      if (upgrade === "websocket") {
        return handleWebSocket(request)
      } else {
        console.log(`[Worker] Expected WebSocket upgrade, got: ${upgrade}`)
        return new Response("Expected WebSocket upgrade", { status: 426 })
      }
    }

    return new Response("Not Found", { status: 404 })
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

function handleWebSocket(request: Request): Response {
  const url = new URL(request.url)
  let joinCode = url.searchParams.get("code") || ""
  const role = url.searchParams.get("role") || "client"

  console.log(`[Worker] WebSocket request: code=${joinCode}, role=${role}`)

  if (!joinCode) {
    console.log(`[Worker] ERROR: No join code provided`)
    return new Response("Missing join code", { status: 400 })
  }

  if (!isValidCode(joinCode)) {
    console.log(`[Worker] ERROR: Invalid join code: ${joinCode}`)
    return new Response("Invalid join code format", { status: 400 })
  }

  const clientIp = request.headers.get("CF-Connecting-IP") || "unknown"
  console.log(`[Worker] Connection from: ${clientIp}`)

  try {
    const pair = new WebSocketPair()
    const [clientSocket, serverSocket] = [pair[0], pair[1]]
    serverSocket.accept()
    console.log(`[Worker] WebSocket accepted for ${joinCode}`)

    const state: SocketState = {
      socket: serverSocket,
      joinCode: joinCode.toUpperCase(),
      role: role,
      registered: false,
      ip: clientIp,
      connectedAt: Date.now(),
    }

    let firstMessageReceived = false

    serverSocket.addEventListener("message", (e: MessageEvent) => {
      console.log(`[Worker] Message received from ${joinCode}: ${e.data}`)
      firstMessageReceived = true

      try {
        const data = JSON.parse(e.data as string)
        console.log(`[Worker] Parsed message type: ${data.type}`)

        if (data.type === "register") {
          state.joinCode = (data.code || data.joinCode || joinCode).toUpperCase()
          state.role = data.role || role
          state.registered = true
          console.log(`[Worker] ${state.role} registered with code: ${state.joinCode}`)

          const existingPeer = roomManager.get(state.joinCode)
          
          if (existingPeer) {
            if (state.role === "host" && existingPeer.role === "host") {
              console.log(`[Worker] ERROR: Host already exists for ${state.joinCode}`)
              serverSocket.send(JSON.stringify({ type: "error", message: "Host already exists" }))
              serverSocket.close()
              return
            }

            console.log(`[Worker] Pairing ${state.role} with existing peer`)
            
            state.socket.addEventListener("message", (ev: MessageEvent) => {
              try {
                existingPeer.socket.send(ev.data)
                console.log(`[Worker] Relayed from ${state.role} to peer`)
              } catch (err) {
                console.error(`[Worker] Relay error:`, err)
              }
            })
            
            existingPeer.socket.addEventListener("message", (ev: MessageEvent) => {
              try {
                state.socket.send(ev.data)
                console.log(`[Worker] Relayed from peer to ${state.role}`)
              } catch (err) {
                console.error(`[Worker] Relay error:`, err)
              }
            })

            const msg = JSON.stringify({ type: "peer_connected" })
            state.socket.send(msg)
            existingPeer.socket.send(msg)

            state.socket.send(JSON.stringify({ type: "connected", joinCode: state.joinCode }))
            console.log(`[Worker] ✓ PAIRED: ${state.ip} <-> ${existingPeer.ip}`)
          } else {
            roomManager.set(state.joinCode, state)
            console.log(`[Worker] Set as waiting for code: ${state.joinCode}`)
            serverSocket.send(JSON.stringify({ type: "waiting", joinCode: state.joinCode }))
          }
          return
        }

        const targetCode = state.registered ? state.joinCode : joinCode.toUpperCase()
        const peer = roomManager.get(targetCode)
        
        if (peer && peer !== state) {
          peer.socket.send(e.data)
          console.log(`[Worker] Relayed message for ${targetCode}`)
        } else {
          console.log(`[Worker] No peer found for ${targetCode}`)
        }
      } catch (err) {
        console.error(`[Worker] Message parse error:`, err)
      }
    })

    serverSocket.addEventListener("close", (event) => {
      console.log(`[Worker] Socket closed: ${joinCode}, code=${event.code}, reason=${event.reason || 'none'}`)
      if (state.registered && roomManager.get(state.joinCode) === state) {
        roomManager.delete(state.joinCode)
        console.log(`[Worker] Removed ${state.role} from room ${state.joinCode}`)
      }
    })

    serverSocket.addEventListener("error", (error) => {
      console.error(`[Worker] Socket error for ${joinCode}:`, error)
    })

    console.log(`[Worker] Socket ready, waiting for register message...`)
    return new Response(null, { status: 101, webSocket: serverSocket })

  } catch (error) {
    console.error(`[Worker] WebSocket setup error:`, error)
    return new Response("WebSocket error", { status: 500 })
  }
}

function isValidCode(code: string): boolean {
  return /^[A-Z0-9]{4,12}$/i.test(code)
}

const roomManager = new Map<string, SocketState>()
