export const config = {
  workerUrl: process.env.NEXT_PUBLIC_WORKER_URL || "wss://dfl-bridge.your-user.workers.dev",
  defaultObsUrl: "ws://127.0.0.1:4455",
  appVersion: "1.0.0",
}

export function getWorkerUrl(): string {
  return config.workerUrl
}

export function generateJoinCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let result = ""
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export function isValidJoinCode(code: string): boolean {
  return /^[A-Z0-9]{6,12}$/.test(code.toUpperCase())
}
