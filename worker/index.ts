interface Env {
  ROOMS: KVNamespace
}

const HEARTBEAT_INTERVAL = 20000
const SOCKET_TIMEOUT = 60000

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({
        status: "ok",
        timestamp: Date.now(),
        uptime: "ready",
      }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    if (url.pathname === "/api/join" && request.method === "POST") {
      return handleJoinRequest(request, env)
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
      let isConnected = true

      async function sendPing() {
        if (!isConnected) return
        try {
          serverSocket.send(JSON.stringify({ type: "ping", timestamp: Date.now() }))
        } catch (e) {
          console.log(`[${pairId}] Ping failed`)
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
            return
          }

          if (isHost && message.type === "obs_event") {
            const clientData = await env.ROOMS.get(`client:${joinCode}`)
            if (clientData) {
              console.log(`[${pairId}] Forwarding OBS event to client`)
              clientSocket.send(JSON.stringify(message))
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
              console.log(`[${pairId}] Client joined`)
              clientSocket.send(JSON.stringify({ type: "joined", joinCode }))
            } else {
              clientSocket.send(JSON.stringify({ type: "error", message: "Host not found" }))
            }
            return
          }

          if (!isHost && message.type === "command") {
            const hostData = await env.ROOMS.get(`host:${joinCode}`)
            if (hostData) {
              console.log(`[${pairId}] Forwarding command to host`)
              clientSocket.send(JSON.stringify(message))
            }
            return
          }

        } catch (error) {
          console.error(`[${pairId}] Message error:`, error)
        }
      })

      clientSocket.addEventListener("close", async () => {
        console.log(`[${pairId}] ${sessionType} disconnected`)
        isConnected = false

        if (heartbeatInterval) clearInterval(heartbeatInterval)

        if (isHost) {
          await env.ROOMS.delete(`host:${joinCode}`)
          clientSocket.send(JSON.stringify({ type: "host_disconnected" }))
        } else {
          await env.ROOMS.delete(`client:${joinCode}`)
        }
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

async function handleJoinRequest(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as { userId?: string }
    const userId = body.userId || "anonymous"

    let joinCode = `${userId.substring(0, 4).toUpperCase()}-${generateRandomSuffix()}`

    let attempts = 0
    while (await env.ROOMS.get(`host:${joinCode}`) && attempts < 5) {
      joinCode = `${userId.substring(0, 4).toUpperCase()}-${generateRandomSuffix()}`
      attempts++
    }

    await env.ROOMS.put(`session:${joinCode}`, JSON.stringify({
      userId,
      createdAt: Date.now(),
    }))

    return new Response(JSON.stringify({
      success: true,
      joinCode,
      expiresAt: Date.now() + 86400000,
    }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }
}

function generateRandomSuffix(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let result = ""
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}
