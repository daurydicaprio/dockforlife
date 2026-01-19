const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL || 'wss://remote.daurydicaprio.com/ws'

export const config = {
  workerUrl: WORKER_URL,
  defaultObsUrl: 'ws://127.0.0.1:4455',
  appVersion: 'v1.0.0-beta',
}

export function getWorkerUrl(): string {
  return WORKER_URL
}

export function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export function isValidJoinCode(code: string): boolean {
  return /^[A-Z0-9]{6,12}$/.test(code.toUpperCase())
}

export function getGitHubReleaseUrl(): string {
  return 'https://github.com/daurydicaprio/dockforlife/releases/latest'
}
