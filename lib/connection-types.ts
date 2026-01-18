export type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting"

export type ConnectionMode = "local" | "remote"

export interface ConnectionEventMap {
  stateChange: ConnectionState
  modeChange: ConnectionMode
  error: Error
  obsEvent: {
    type: string
    data: unknown
  }
}

export interface IConnectionStrategy {
  readonly mode: ConnectionMode
  readonly state: ConnectionState

  connect(url: string, password?: string): Promise<void>
  disconnect(): Promise<void>
  send(method: string, params?: Record<string, unknown>): Promise<unknown>
  on<K extends keyof ConnectionEventMap>(event: K, callback: (data: ConnectionEventMap[K]) => void): () => void
  getCurrentScene(): Promise<string>
  getSceneList(): Promise<{ sceneName: string }[]>
  getInputList(): Promise<{ inputName: string }[]>
  toggleRecord(): Promise<void>
  toggleStream(): Promise<void>
  toggleMute(inputName: string): Promise<void>
  setScene(sceneName: string): Promise<void>
  setSourceFilterEnabled(sourceName: string, filterName: string, enabled: boolean): Promise<void>
  setSceneItemEnabled(sceneName: string, sceneItemId: number, enabled: boolean): Promise<void>
  destroy(): void
}

export interface ConnectionManagerConfig {
  localUrl?: string
  remoteUrl?: string
  joinCode?: string
  password?: string
  connectionTimeout?: number
  maxRetries?: number
  retryDelay?: number
}

export interface ConnectionResult {
  strategy: IConnectionStrategy
  mode: ConnectionMode
  url: string
}

export interface ConnectionManager {
  readonly state: ConnectionState
  readonly mode: ConnectionMode
  readonly currentUrl: string
  readonly joinCode: string | undefined

  connect(config: ConnectionManagerConfig): Promise<ConnectionResult>
  disconnect(): Promise<void>
  send(method: string, params?: Record<string, unknown>): Promise<unknown>
  on<K extends keyof ConnectionEventMap>(event: K, callback: (data: ConnectionEventMap[K]) => void): () => void
  destroy(): void
}
