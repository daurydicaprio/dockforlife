import {
  IConnectionStrategy,
  ConnectionState,
  ConnectionMode,
  ConnectionEventMap,
} from "./connection-types"

/**
 * Remote connection strategy using WebSocket relay via Cloudflare Worker
 * Implements the IConnectionStrategy interface for remote OBS control
 */
export class RemoteConnectionStrategy implements IConnectionStrategy {
  readonly mode: ConnectionMode = "remote"
  state: ConnectionState = "disconnected"

  private eventHandlers: Map<keyof ConnectionEventMap, ((data: ConnectionEventMap[keyof ConnectionEventMap]) => void)[]> = new Map()
  private destroyCalled = false
  private joinCode: string | undefined
  private workerUrl: string = ""
  private ws: WebSocket | null = null
  private pendingRequests: Map<string, { resolve: (value: unknown) => void; reject: (reason: Error) => void }> = new Map()
  private requestIdCounter = 0
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 3
  private reconnectDelay = 5000

  getJoinCode(): string | undefined {
    return this.joinCode
  }

  /**
   * Establishes WebSocket connection to Cloudflare Worker relay
   * @param url - Worker WebSocket URL (wss://...)
   * @param password - Not used in remote mode (OBS password is handled by proxy)
   * @param joinCode - Pairing code for session identification
   */
  async connect(url: string, password?: string, joinCode?: string): Promise<void> {
    if (this.destroyCalled) {
      throw new Error("Strategy has been destroyed")
    }

    if (!joinCode || joinCode.length < 4) {
      throw new Error("Valid join code (4+ characters) is required")
    }

    this.state = "connecting"
    this.emit("stateChange", "connecting")

    this.workerUrl = url
    this.joinCode = joinCode.toUpperCase()

    return this.establishConnection()
  }

  /**
   * Core connection logic - establishes WebSocket and handles handshake
   */
  private establishConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Build WebSocket URL with query parameters
        const url = new URL(this.workerUrl)
        url.searchParams.set("code", this.joinCode!)
        url.searchParams.set("role", "client")

        console.log("[RemoteStrategy] Connecting to:", url.toString())

        // Create WebSocket connection
        this.ws = new WebSocket(url.toString())

        // Connection timeout
        const connectionTimeout = setTimeout(() => {
          this.cleanup()
          reject(new Error("Connection timeout after 10000ms"))
        }, 10000)

        this.ws.onopen = () => {
          console.log("[RemoteStrategy] WebSocket opened, sending register...")
          // Send registration message
          this.ws!.send(JSON.stringify({
            type: "register",
            code: this.joinCode,
            role: "client"
          }))
        }

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data as string)
            console.log("[RemoteStrategy] Received:", data.type)

            this.handleMessage(data, resolve, reject, connectionTimeout)
          } catch (err) {
            console.error("[RemoteStrategy] Failed to parse message:", err)
          }
        }

        this.ws.onerror = (error) => {
          clearTimeout(connectionTimeout)
          console.error("[RemoteStrategy] WebSocket error:", error)
          this.cleanup()
          reject(new Error("WebSocket connection failed"))
        }

        this.ws.onclose = (event) => {
          console.log("[RemoteStrategy] Disconnected:", event.code, event.reason)
          this.handleDisconnection()
        }

      } catch (error) {
        this.cleanup()
        reject(error)
      }
    })
  }

  /**
   * Handles incoming WebSocket messages
   */
  private handleMessage(
    data: any, 
    resolve: () => void, 
    reject: (reason: Error) => void,
    connectionTimeout: ReturnType<typeof setTimeout>
  ): void {
    switch (data.type) {
      case "waiting":
        console.log("[RemoteStrategy] Waiting for host...")
        // Keep waiting, don't resolve yet
        break

      case "peer_connected":
        console.log("[RemoteStrategy] Paired with host!")
        clearTimeout(connectionTimeout)
        this.state = "connected"
        this.reconnectAttempts = 0
        this.emit("stateChange", "connected")
        this.startHeartbeat()
        resolve()
        break

      case "obs_data":
        // Forward OBS data to listeners
        this.emit("obsEvent", {
          type: "obs_data",
          data: data
        })
        break

      case "obs_status":
        // Forward status updates
        this.emit("obsEvent", {
          type: "obs_status",
          data: data
        })
        break

      case "error":
        clearTimeout(connectionTimeout)
        console.error("[RemoteStrategy] Server error:", data.message)
        reject(new Error(data.message || "Server error"))
        break

      case "pong":
        // Heartbeat response
        console.log("[RemoteStrategy] Heartbeat received")
        break

      default:
        // Handle pending request responses
        this.handleResponse(data)
    }
  }

  /**
   * Handles responses to pending requests
   */
  private handleResponse(data: any): void {
    if (data.requestId && this.pendingRequests.has(data.requestId)) {
      const { resolve, reject } = this.pendingRequests.get(data.requestId)!
      this.pendingRequests.delete(data.requestId)

      if (data.error) {
        reject(new Error(data.error))
      } else {
        resolve(data.result || {})
      }
    }
  }

  /**
   * Handles disconnection and attempts reconnection
   */
  private handleDisconnection(): void {
    this.cleanup()

    if (this.state === "connected" && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.state = "reconnecting"
      this.emit("stateChange", "reconnecting")
      
      this.reconnectAttempts++
      console.log(`[RemoteStrategy] Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`)
      
      setTimeout(() => {
        this.establishConnection().catch(() => {
          // Reconnection failed, will be handled by max attempts check
        })
      }, this.reconnectDelay)
    } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.state = "disconnected"
      this.emit("stateChange", "disconnected")
      this.emit("error", new Error("Max reconnection attempts reached"))
    }
  }

  /**
   * Starts heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "ping" }))
      }
    }, 30000) // 30 seconds
  }

  /**
   * Cleans up resources
   */
  private cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }

    if (this.ws) {
      try {
        this.ws.close()
      } catch {}
      this.ws = null
    }

    // Clear pending requests
    this.pendingRequests.forEach(({ reject }) => {
      reject(new Error("Connection closed"))
    })
    this.pendingRequests.clear()
  }

  async disconnect(): Promise<void> {
    this.cleanup()
    this.state = "disconnected"
    this.emit("stateChange", "disconnected")
    console.log("[RemoteStrategy] Disconnected")
  }

  /**
   * Sends command to OBS via relay
   */
  async send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (this.state !== "connected" || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected")
    }

    const requestId = `req_${++this.requestIdCounter}_${Date.now()}`

    return new Promise((resolve, reject) => {
      // Store pending request
      this.pendingRequests.set(requestId, { resolve, reject })

      // Send command
      const command = {
        type: "obs_command",
        requestId,
        command: method,
        args: params || {}
      }

      try {
        this.ws!.send(JSON.stringify(command))
        
        // Timeout after 10 seconds
        setTimeout(() => {
          if (this.pendingRequests.has(requestId)) {
            this.pendingRequests.delete(requestId)
            reject(new Error("Request timeout"))
          }
        }, 10000)
      } catch (error) {
        this.pendingRequests.delete(requestId)
        reject(error)
      }
    })
  }

  on<K extends keyof ConnectionEventMap>(
    event: K,
    callback: (data: ConnectionEventMap[K]) => void,
  ): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, [])
    }
    this.eventHandlers.get(event)!.push(callback as (data: ConnectionEventMap[keyof ConnectionEventMap]) => void)
    
    return () => {
      const handlers = this.eventHandlers.get(event)
      if (handlers) {
        const idx = handlers.indexOf(callback as () => void)
        if (idx > -1) {
          handlers.splice(idx, 1)
        }
      }
    }
  }

  private emit<K extends keyof ConnectionEventMap>(event: K, data: ConnectionEventMap[K]): void {
    const handlers = this.eventHandlers.get(event)
    if (handlers) {
      handlers.forEach((handler) => handler(data))
    }
  }

  // Convenience methods for common OBS operations
  async getCurrentScene(): Promise<string> {
    const result = await this.send("GetCurrentProgramScene", {}) as { sceneName: string }
    return result.sceneName
  }

  async getSceneList(): Promise<{ sceneName: string }[]> {
    const result = await this.send("GetSceneList", {}) as { scenes: { sceneName: string }[] }
    return result.scenes
  }

  async getInputList(): Promise<{ inputName: string }[]> {
    const result = await this.send("GetInputList", {}) as { inputs: { inputName: string }[] }
    return result.inputs
  }

  async toggleRecord(): Promise<void> {
    await this.send("ToggleRecord", {})
  }

  async toggleStream(): Promise<void> {
    await this.send("ToggleStream", {})
  }

  async toggleMute(inputName: string): Promise<void> {
    await this.send("ToggleInputMute", { inputName })
  }

  async setScene(sceneName: string): Promise<void> {
    await this.send("SetCurrentProgramScene", { sceneName })
  }

  async setSourceFilterEnabled(sourceName: string, filterName: string, enabled: boolean): Promise<void> {
    await this.send("SetSourceFilterEnabled", { sourceName, filterName, filterEnabled: enabled })
  }

  async setSceneItemEnabled(sceneName: string, sceneItemId: number, enabled: boolean): Promise<void> {
    await this.send("SetSceneItemEnabled", { sceneName, sceneItemId, sceneItemEnabled: enabled })
  }

  destroy(): void {
    this.destroyCalled = true
    this.cleanup()
    this.eventHandlers.clear()
    this.state = "disconnected"
  }
}
