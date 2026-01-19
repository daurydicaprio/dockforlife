interface Env {}

export default {
  async fetch(_request: Request): Promise<Response> {
    const url = new URL(_request.url)

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json" }
      })
    }

    if (url.pathname === "/ws" && _request.headers.get("Upgrade") === "websocket") {
      return handleWebSocket(_request)
    }

    return new Response("Not Found", { status: 404 })
  }
}

function handleWebSocket(request: Request): Response {
  const url = new URL(request.url)
  const joinCode = url.searchParams.get("code")

  if (!joinCode || !isValidCode(joinCode)) {
    return new Response("Invalid join code", { status: 400 })
  }

  const clientIp = request.headers.get("CF-Connecting-IP") || "unknown"

  try {
    const pair = new WebSocketPair()
    const [clientSocket, serverSocket] = [pair[0], pair[1]]
    serverSocket.accept()

    const existingPeer = roomManager.get(joinCode)

    if (existingPeer) {
      serverSocket.addEventListener("message", (e: MessageEvent) => {
        existingPeer.send(e.data)
      })
      existingPeer.addEventListener("message", (e: MessageEvent) => {
        serverSocket.send(e.data)
      })

      existingPeer.send(JSON.stringify({ type: "peer_connected" }))
      serverSocket.send(JSON.stringify({ type: "connected", joinCode }))

      console.log(`[${joinCode}] Paired: ${clientIp}`)
    } else {
      roomManager.set(joinCode, serverSocket)
      serverSocket.send(JSON.stringify({ type: "waiting" }))
      console.log(`[${joinCode}] Waiting: ${clientIp}`)
    }

    serverSocket.addEventListener("close", () => {
      if (roomManager.get(joinCode) === serverSocket) {
        roomManager.delete(joinCode)
        console.log(`[${joinCode}] Disconnected: ${clientIp}`)
      }
    })

    return new Response(null, { status: 101, webSocket: serverSocket })

  } catch (error) {
    console.error("WebSocket error:", error)
    return new Response("Internal Server Error", { status: 500 })
  }
}

function isValidCode(code: string): boolean {
  return /^[A-Z0-9]{4,12}$/i.test(code)
}

const roomManager = new Map<string, WebSocket>()
