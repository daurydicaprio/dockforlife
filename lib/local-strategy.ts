import OBSWebSocket from "obs-websocket-js"
import {
  IConnectionStrategy,
  ConnectionState,
  ConnectionMode,
  ConnectionEventMap,
} from "./connection-types"

export class LocalConnectionStrategy implements IConnectionStrategy {
  readonly mode: ConnectionMode = "local"
  state: ConnectionState = "disconnected"

  private obs: OBSWebSocket | null = null
  private eventHandlers: Map<keyof ConnectionEventMap, ((data: ConnectionEventMap[keyof ConnectionEventMap]) => void)[]> = new Map()
  private connectionTimeout: NodeJS.Timeout | null = null
  private destroyCalled = false

  async connect(url: string, password?: string): Promise<void> {
    if (this.destroyCalled) {
      throw new Error("Strategy has been destroyed")
    }

    this.state = "connecting"
    this.emit("stateChange", "connecting")

    this.obs = new OBSWebSocket()

    this.setupObsListeners()

    const timeoutMs = 3000

    this.connectionTimeout = setTimeout(() => {
      if (this.state === "connecting" && this.obs) {
        console.log("[LocalStrategy] Connection timeout, disconnecting...")
        this.obs.disconnect().catch(() => {})
        this.state = "disconnected"
        this.emit("stateChange", "disconnected")
      }
    }, timeoutMs)

    try {
      await this.obs.connect(url, password || undefined, { rpcVersion: 1 })
      
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout)
        this.connectionTimeout = null
      }

      this.state = "connected"
      this.emit("stateChange", "connected")
      console.log("[LocalStrategy] Connected to", url)
    } catch (error) {
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout)
        this.connectionTimeout = null
      }

      if (this.destroyCalled) {
        return
      }

      this.state = "disconnected"
      this.emit("stateChange", "disconnected")
      throw error
    }
  }

  async disconnect(): Promise<void> {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout)
      this.connectionTimeout = null
    }

    if (this.obs) {
      try {
        await this.obs.disconnect()
      } catch {
        // Ignore disconnect errors
      }
      this.obs = null
    }

    this.state = "disconnected"
    this.emit("stateChange", "disconnected")
  }

  async send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.obs) {
      throw new Error("Not connected")
    }
    return (this.obs.call as unknown as (method: string, params?: Record<string, unknown>) => Promise<unknown>)(method, params)
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

  private setupObsListeners(): void {
    if (!this.obs) return

    this.obs.on("ConnectionClosed", (event) => {
      console.log("[LocalStrategy] Connection closed:", event)
      if (!this.destroyCalled) {
        this.state = "disconnected"
        this.emit("stateChange", "disconnected")
      }
    })

    this.obs.on("ConnectionError", (event) => {
      console.log("[LocalStrategy] Connection error:", event)
      if (!this.destroyCalled) {
        this.state = "disconnected"
        this.emit("stateChange", "disconnected")
        this.emit("error", new Error(String(event)))
      }
    })
  }

  private emit<K extends keyof ConnectionEventMap>(event: K, data: ConnectionEventMap[K]): void {
    const handlers = this.eventHandlers.get(event)
    if (handlers) {
      handlers.forEach((handler) => handler(data))
    }
  }

  async getCurrentScene(): Promise<string> {
    if (!this.obs) throw new Error("Not connected")
    const response = await this.obs.call("GetCurrentProgramScene") as unknown as { currentProgramSceneName: string }
    return response.currentProgramSceneName
  }

  async getSceneList(): Promise<{ sceneName: string }[]> {
    if (!this.obs) throw new Error("Not connected")
    const response = await this.obs.call("GetSceneList") as unknown as { scenes: { sceneName: string }[] }
    return response.scenes
  }

  async getInputList(): Promise<{ inputName: string }[]> {
    if (!this.obs) throw new Error("Not connected")
    const response = await this.obs.call("GetInputList") as unknown as { inputs: { inputName: string }[] }
    return response.inputs
  }

  async toggleRecord(): Promise<void> {
    if (!this.obs) throw new Error("Not connected")
    await this.obs.call("ToggleRecord")
  }

  async toggleStream(): Promise<void> {
    if (!this.obs) throw new Error("Not connected")
    await this.obs.call("ToggleStream")
  }

  async toggleMute(inputName: string): Promise<void> {
    if (!this.obs) throw new Error("Not connected")
    await this.obs.call("ToggleInputMute", { inputName })
  }

  async setScene(sceneName: string): Promise<void> {
    if (!this.obs) throw new Error("Not connected")
    await this.obs.call("SetCurrentProgramScene", { sceneName })
  }

  async setSourceFilterEnabled(sourceName: string, filterName: string, enabled: boolean): Promise<void> {
    if (!this.obs) throw new Error("Not connected")
    await this.obs.call("SetSourceFilterEnabled", { sourceName, filterName, filterEnabled: enabled })
  }

  async setSceneItemEnabled(sceneName: string, sceneItemId: number, enabled: boolean): Promise<void> {
    if (!this.obs) throw new Error("Not connected")
    await this.obs.call("SetSceneItemEnabled", { sceneName, sceneItemId, sceneItemEnabled: enabled })
  }

  destroy(): void {
    this.destroyCalled = true
    
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout)
      this.connectionTimeout = null
    }

    this.eventHandlers.clear()
    
    if (this.obs) {
      this.obs.disconnect().catch(() => {})
      this.obs = null
    }

    this.state = "disconnected"
  }
}
