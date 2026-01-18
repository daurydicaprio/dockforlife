import {
  IConnectionStrategy,
  ConnectionState,
  ConnectionMode,
  ConnectionEventMap,
} from "./connection-types"

export class RemoteConnectionStrategy implements IConnectionStrategy {
  readonly mode: ConnectionMode = "remote"
  state: ConnectionState = "disconnected"

  private eventHandlers: Map<keyof ConnectionEventMap, ((data: ConnectionEventMap[keyof ConnectionEventMap]) => void)[]> = new Map()
  private destroyCalled = false
  private joinCode: string | undefined
  private workerUrl: string = ""

  getJoinCode(): string | undefined {
    return this.joinCode
  }

  async connect(url: string, password?: string, joinCode?: string): Promise<void> {
    if (this.destroyCalled) {
      throw new Error("Strategy has been destroyed")
    }

    this.state = "connecting"
    this.emit("stateChange", "connecting")

    this.workerUrl = url
    this.joinCode = joinCode

    console.log("[RemoteStrategy] Connection not yet implemented")
    console.log("[RemoteStrategy] Would connect to:", url)
    console.log("[RemoteStrategy] Join Code:", joinCode)

    // TODO: Implement WebSocket connection to Cloudflare Worker
    // For now, we simulate a successful connection after a short delay
    await new Promise((resolve) => setTimeout(resolve, 500))

    this.state = "connected"
    this.emit("stateChange", "connected")
  }

  async disconnect(): Promise<void> {
    this.state = "disconnected"
    this.emit("stateChange", "disconnected")
    console.log("[RemoteStrategy] Disconnected")
  }

  async send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (this.state !== "connected") {
      throw new Error("Not connected")
    }

    // TODO: Implement actual WebSocket send to Cloudflare Worker
    console.log("[RemoteStrategy] Would send:", method, params)
    throw new Error("RemoteStrategy not implemented yet")
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

  async getCurrentScene(): Promise<string> {
    throw new Error("RemoteStrategy not implemented yet")
  }

  async getSceneList(): Promise<{ sceneName: string }[]> {
    throw new Error("RemoteStrategy not implemented yet")
  }

  async getInputList(): Promise<{ inputName: string }[]> {
    throw new Error("RemoteStrategy not implemented yet")
  }

  async toggleRecord(): Promise<void> {
    throw new Error("RemoteStrategy not implemented yet")
  }

  async toggleStream(): Promise<void> {
    throw new Error("RemoteStrategy not implemented yet")
  }

  async toggleMute(inputName: string): Promise<void> {
    throw new Error("RemoteStrategy not implemented yet")
  }

  async setScene(sceneName: string): Promise<void> {
    throw new Error("RemoteStrategy not implemented yet")
  }

  async setSourceFilterEnabled(sourceName: string, filterName: string, enabled: boolean): Promise<void> {
    throw new Error("RemoteStrategy not implemented yet")
  }

  async setSceneItemEnabled(sceneName: string, sceneItemId: number, enabled: boolean): Promise<void> {
    throw new Error("RemoteStrategy not implemented yet")
  }

  destroy(): void {
    this.destroyCalled = true
    this.eventHandlers.clear()
    this.state = "disconnected"
  }
}
