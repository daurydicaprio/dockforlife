interface Env {
  ROOMS: KVNamespace
}

const HEARTBEAT_INTERVAL = 20000
const SOCKET_TIMEOUT = 60000

interface RoomState {
  pairId: string
  connectedAt: number
  lastPing: number
  isHost: boolean
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ 
        status: "ok", 
        timestamp: Date.now(),
        uptime: "ready"
      }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    const upgradeHeader = request.headers.get("Upgrade")
    if (upgradeHeader !== "websocket" || url.pathname !== "/ws") {
      return new Response("Expected WebSocket upgrade at /ws", { status: 426 })
    }

    const joinCode = url.searchParams.get("code")
    const sessionType = url.searchParams.get("type")

    if (!joinCode || !sessionType) {
      return new Response("Missing 'code' or 'type' query parameter", { status: 400 })
    }

    const pairId = `${joinCode}:${Date.now()}`
    const clientIp = request.headers.get("CF-Connecting-IP") || "unknown"

    try {
      const [clientSocket, serverSocket] = new WebSocketPair()
      serverSocket.accept()

      const isHost = sessionType === "host"
      console.log(`[${pairId}] ${sessionType} connected from ${clientIp}`)

      let heartbeatInterval: number | null = null
      let timeoutInterval: number | null = null
      let isConnected = true

      async function broadcastToPeer(message: string) {
        try {
          clientSocket.send(message)
        } catch (e) {
          console.error(`[${pairId}] Broadcast failed:`, e)
        }
      }

      async function sendPing() {
        if (!isConnected) return
        try {
          serverSocket.send(JSON.stringify({ type: "ping", timestamp: Date.now() }))
          console.log(`[${pairId}] Sent ping`)
        } catch (e) {
          console.error(`[${pairId}] Ping failed:`, e)
        }
      }

      async function checkTimeout() {
        const roomKey = isHost ? `host:${joinCode}` : `client:${joinCode}`
        const cached = await env.ROOMS.get(roomKey) as string | null
        if (cached) {
          const state: RoomState = JSON.parse(cached)
          const now = Date.now()
          if (now - state.lastPing > SOCKET_TIMEOUT) {
            console.log(`[${pairId}] Socket timeout (${SOCKET_TIMEOUT}ms without activity)`)
            isConnected = false
            clientSocket.close()
          }
        }
      }

      clientSocket.addEventListener("message", async (event) => {
        console.log(`[${pairId}] Received: ${event.data}`)

        try {
          const data = event.data as string
          
          if (data === "pong") {
            const roomKey = isHost ? `host:${joinCode}` : `client:${joinCode}`
            const cached = await env.ROOMS.get(roomKey) as string | null
            if (cached) {
              const state = JSON.parse(cached)
              state.lastPing = Date.now()
              await env.ROOMS.put(roomKey, JSON.stringify(state))
            }
            console.log(`[${pairId}] Received pong`)
            return
          }

          const message = JSON.parse(data)

          if (isHost && message.type === "register") {
            await env.ROOMS.put(`host:${joinCode}`, JSON.stringify({
              pairId,
              connectedAt: Date.now(),
              lastPing: Date.now(),
              isHost: true,
            }))
            console.log(`[${pairId}] Host registered for code: ${joinCode}`)
            
            heartbeatInterval = setInterval(sendPing, HEARTBEAT_INTERVAL) as unknown as number
            timeoutInterval = setInterval(checkTimeout, 5000) as unknown as number
            return
          }

          if (isHost && message.type === "obs_event") {
            const clientData = await env.ROOMS.get(`client:${joinCode}`)
            if (clientData) {
              console.log(`[${pairId}] Forwarding OBS event to client`)
              broadcastToPeer(JSON.stringify(message))
            } else {
              console.log(`[${pairId}] No client connected yet, queuing event`)
            }
            return
          }

          if (!isHost && message.type === "join") {
            const hostData = await env.ROOMS.get(`host:${joinCode}`)
            if (hostData) {
              await env.ROOMS.put(`client:${joinCode}`, JSON.stringify({
                pairId,
                connectedAt: Date.now(),
                lastPing: Date.now(),
                isHost: false,
              }))
              console.log(`[${pairId}] Client joined, notifying host`)
              broadcastToPeer(JSON.stringify({ type: "client_joined", joinCode }))
            } else {
              console.log(`[${pairId}] No host found for code: ${joinCode}`)
              broadcastToPeer(JSON.stringify({ type: "error", message: "Host not found" }))
            }
            return
          }

          if (!isHost && message.type === "command") {
            const hostData = await env.ROOMS.get(`host:${joinCode}`)
            if (hostData) {
              console.log(`[${pairId}] Forwarding command to host`)
              broadcastToPeer(JSON.stringify(message))
            }
            return
          }

          if (!isHost && message.type === "obs_event") {
            console.log(`[${pairId}] Ignoring obs_event from client`)
            return
          }

        } catch (error) {
          console.error(`[${pairId}] Message error:`, error)
        }
      })

      clientSocket.addEventListener("close", async (event) => {
        console.log(`[${pairId}] ${sessionType} disconnected (code: ${event.code})`)
        isConnected = false
        
        if (heartbeatInterval) clearInterval(heartbeatInterval)
        if (timeoutInterval) clearInterval(timeoutInterval)

        if (isHost) {
          await env.ROOMS.delete(`host:${joinCode}`)
          console.log(`[${pairId}] Host removed, notifying clients`)
          broadcastToPeer(JSON.stringify({ type: "host_disconnected" }))
        } else {
          await env.ROOMS.delete(`client:${joinCode}`)
          console.log(`[${pairId}] Client removed`)
        }
      })

      clientSocket.addEventListener("error", (error) => {
        console.error(`[${pairId}] Socket error:`, error)
      })

      return new Response(null, {
        status: 101,
        webSocket: serverSocket,
      })

    } catch (error) {
      console.error(`[${pairId}] WebSocket setup error:`, error)
      return new Response("WebSocket error", { status: 500 })
    }
  },
}
