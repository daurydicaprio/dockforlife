interface Env {
  ROOMS: KVNamespace
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", timestamp: Date.now() }), {
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

      if (isHost) {
        await env.ROOMS.put(`host:${joinCode}`, JSON.stringify({
          pairId,
          connectedAt: Date.now(),
        }))
        console.log(`[${pairId}] Host registered for code: ${joinCode}`)
      }

      let hostSocket: WebSocket | null = null
      let clientSocketRef: WebSocket | null = clientSocket

      async function broadcastToPeer(message: string) {
        if (isHost && clientSocketRef) {
          try {
            clientSocketRef.send(message)
          } catch (e) {
            console.error(`[${pairId}] Broadcast to client failed:`, e)
          }
        } else if (!isHost && hostSocket) {
          try {
            hostSocket.send(message)
          } catch (e) {
            console.error(`[${pairId}] Broadcast to host failed:`, e)
          }
        }
      }

      clientSocket.addEventListener("message", async (event) => {
        try {
          const data = event.data as string
          const message = JSON.parse(data)

          if (isHost && message.type === "obs_event") {
            const clientData = await env.ROOMS.get(`client:${joinCode}`)
            if (clientData) {
              const parsed = JSON.parse(clientData)
              console.log(`[${pairId}] Forwarding OBS event to client`)
            }
          }

          if (!isHost && message.type === "command") {
            const hostData = await env.ROOMS.get(`host:${joinCode}`)
            if (hostData) {
              console.log(`[${pairId}] Forwarding command to host`)
            }
          }
        } catch (error) {
          console.error(`[${pairId}] Message error:`, error)
        }
      })

      clientSocket.addEventListener("close", async () => {
        console.log(`[${pairId}] ${sessionType} disconnected`)
        if (isHost) {
          await env.ROOMS.delete(`host:${joinCode}`)
          const clientData = await env.ROOMS.get(`client:${joinCode}`)
          if (clientData) {
            await env.ROOMS.delete(`client:${joinCode}`)
          }
        } else {
          await env.ROOMS.delete(`client:${joinCode}`)
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
