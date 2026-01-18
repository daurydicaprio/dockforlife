import {
  ConnectionManagerConfig,
  ConnectionResult,
  ConnectionState,
  ConnectionMode,
  ConnectionEventMap,
  IConnectionStrategy,
  ConnectionManager,
} from "./connection-types"
import { LocalConnectionStrategy } from "./local-strategy"
import { RemoteConnectionStrategy } from "./remote-strategy"

export type { ConnectionManager, ConnectionState, ConnectionMode } from "./connection-types"

export class DefaultConnectionManager implements ConnectionManager {
  state: ConnectionState = "disconnected"
  mode: ConnectionMode = "local"
  currentUrl: string = ""
  joinCode: string | undefined

  private strategy: IConnectionStrategy | null = null
  private eventHandlers: Map<keyof ConnectionEventMap, ((data: ConnectionEventMap[keyof ConnectionEventMap]) => void)[]> = new Map()
  private config: ConnectionManagerConfig | null = null

  async connect(config: ConnectionManagerConfig): Promise<ConnectionResult> {
    this.config = config

    const timeout = config.connectionTimeout ?? 3000
    const localUrl = config.localUrl ?? "ws://127.0.0.1:4455"

    this.state = "connecting"
    this.emit("stateChange", "connecting")

    console.log("[ConnectionManager] Attempting local connection to:", localUrl)
    
    const localStrategy = new LocalConnectionStrategy()

    try {
      await this.connectWithTimeout(localStrategy, localUrl, config.password, timeout)
      
      this.strategy = localStrategy
      this.mode = "local"
      this.currentUrl = localUrl
      this.joinCode = config.joinCode

      this.setupStrategyListeners(localStrategy)

      console.log("[ConnectionManager] Local connection successful")
      return {
        strategy: localStrategy,
        mode: "local",
        url: localUrl,
      }
    } catch (localError) {
      console.log("[ConnectionManager] Local connection failed:", localError)
      localStrategy.destroy()

      if (config.remoteUrl) {
        console.log("[ConnectionManager] Falling back to remote connection:", config.remoteUrl)
        
        const remoteStrategy = new RemoteConnectionStrategy()
        
        try {
          await remoteStrategy.connect(config.remoteUrl, config.password, config.joinCode)
          
          this.strategy = remoteStrategy
          this.mode = "remote"
          this.currentUrl = config.remoteUrl
          this.joinCode = config.joinCode

          this.setupStrategyListeners(remoteStrategy)

          console.log("[ConnectionManager] Remote connection successful")
          return {
            strategy: remoteStrategy,
            mode: "remote",
            url: config.remoteUrl,
          }
        } catch (remoteError) {
          console.log("[ConnectionManager] Remote connection failed:", remoteError)
          remoteStrategy.destroy()
          
          this.state = "disconnected"
          this.emit("stateChange", "disconnected")
          throw new Error("All connection strategies failed")
        }
      } else {
        this.state = "disconnected"
        this.emit("stateChange", "disconnected")
        throw new Error("Local connection failed and no remote URL configured")
      }
    }
  }

  private async connectWithTimeout(
    strategy: LocalConnectionStrategy,
    url: string,
    password?: string,
    timeoutMs: number = 3000,
  ): Promise<void> {
    let timeoutId: NodeJS.Timeout | null = null

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Connection timeout after ${timeoutMs}ms`))
      }, timeoutMs)
    })

    const connectPromise = strategy.connect(url, password)

    try {
      await Promise.race([connectPromise, timeoutPromise])
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }

  private setupStrategyListeners(strategy: IConnectionStrategy): void {
    strategy.on("stateChange", (state: ConnectionState) => {
      this.state = state
      this.emit("stateChange", state)
    })

    strategy.on("modeChange", (mode: ConnectionMode) => {
      this.mode = mode
      this.emit("modeChange", mode)
    })

    strategy.on("error", (error: Error) => {
      this.emit("error", error)
    })
  }

  async disconnect(): Promise<void> {
    if (this.strategy) {
      await this.strategy.disconnect()
      this.strategy = null
    }
    this.state = "disconnected"
    this.mode = "local"
    this.currentUrl = ""
    this.emit("stateChange", "disconnected")
  }

  async send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.strategy) {
      throw new Error("Not connected")
    }
    return this.strategy.send(method, params)
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

  destroy(): void {
    if (this.strategy) {
      this.strategy.destroy()
      this.strategy = null
    }
    this.eventHandlers.clear()
    this.state = "disconnected"
    this.mode = "local"
  }
}

export function createConnectionManager(): DefaultConnectionManager {
  return new DefaultConnectionManager()
}
