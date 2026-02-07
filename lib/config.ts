/**
 * Dynamic Configuration System for DockForLife
 * 
 * This module provides a centralized configuration management system
 * that supports environment variables and runtime configuration.
 * 
 * Usage:
 * - Set NEXT_PUBLIC_WORKER_URL in .env for custom worker URL
 * - Set NEXT_PUBLIC_APP_NAME for custom branding
 * - All configuration is typed and validated
 */

// Configuration interface
export interface AppConfig {
  // WebSocket Worker URL for remote connections
  workerUrl: string
  
  // Default OBS WebSocket URL for local connections
  defaultObsUrl: string
  
  // Application metadata
  appName: string
  appVersion: string
  appDescription: string
  
  // GitHub repository URL
  githubRepo: string
  
  // URLs
  authorUrl: string
  paypalUrl: string
  
  // Connection settings
  connectionTimeout: number
  maxReconnectAttempts: number
  reconnectDelay: number
  
  // Feature flags
  enableRemoteMode: boolean
  enableLocalMode: boolean
  
  // UI settings
  defaultTheme: 'dark' | 'light'
  defaultLanguage: 'en' | 'es'
}

// Default configuration values
const defaultConfig: AppConfig = {
  workerUrl: 'wss://your-worker.your-subdomain.workers.dev/ws',
  defaultObsUrl: 'ws://127.0.0.1:4455',
  appName: 'DockForLife',
  appVersion: 'v1.0.0-beta',
  appDescription: 'Control OBS from any device on your local network',
  githubRepo: 'https://github.com/daurydicaprio/dockforlife',
  authorUrl: 'https://daurydicaprio.com',
  paypalUrl: 'https://paypal.me/daurydicaprio',
  connectionTimeout: 10000,
  maxReconnectAttempts: 3,
  reconnectDelay: 5000,
  enableRemoteMode: true,
  enableLocalMode: true,
  defaultTheme: 'dark',
  defaultLanguage: 'en',
}

/**
 * Loads configuration from environment variables
 * Falls back to defaults for missing values
 */
function loadConfig(): AppConfig {
  return {
    workerUrl: process.env.NEXT_PUBLIC_WORKER_URL || defaultConfig.workerUrl,
    defaultObsUrl: process.env.NEXT_PUBLIC_DEFAULT_OBS_URL || defaultConfig.defaultObsUrl,
    appName: process.env.NEXT_PUBLIC_APP_NAME || defaultConfig.appName,
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION || defaultConfig.appVersion,
    appDescription: process.env.NEXT_PUBLIC_APP_DESCRIPTION || defaultConfig.appDescription,
    githubRepo: process.env.NEXT_PUBLIC_GITHUB_REPO || defaultConfig.githubRepo,
    authorUrl: process.env.NEXT_PUBLIC_AUTHOR_URL || defaultConfig.authorUrl,
    paypalUrl: process.env.NEXT_PUBLIC_PAYPAL_URL || defaultConfig.paypalUrl,
    connectionTimeout: parseInt(process.env.NEXT_PUBLIC_CONNECTION_TIMEOUT || '10000', 10),
    maxReconnectAttempts: parseInt(process.env.NEXT_PUBLIC_MAX_RECONNECT_ATTEMPTS || '3', 10),
    reconnectDelay: parseInt(process.env.NEXT_PUBLIC_RECONNECT_DELAY || '5000', 10),
    enableRemoteMode: process.env.NEXT_PUBLIC_ENABLE_REMOTE !== 'false',
    enableLocalMode: process.env.NEXT_PUBLIC_ENABLE_LOCAL !== 'false',
    defaultTheme: (process.env.NEXT_PUBLIC_DEFAULT_THEME as 'dark' | 'light') || defaultConfig.defaultTheme,
    defaultLanguage: (process.env.NEXT_PUBLIC_DEFAULT_LANGUAGE as 'en' | 'es') || defaultConfig.defaultLanguage,
  }
}

// Export singleton configuration instance
export const config: AppConfig = loadConfig()

/**
 * Gets the WebSocket Worker URL for remote connections
 * @returns Worker URL string
 */
export function getWorkerUrl(): string {
  return config.workerUrl
}

/**
 * Gets the default OBS WebSocket URL for local connections
 * @returns OBS URL string
 */
export function getDefaultObsUrl(): string {
  return config.defaultObsUrl
}

/**
 * Generates a random join code for session pairing
 * Uses alphanumeric characters excluding confusing ones (0, O, I, 1)
 * @returns 8-character join code
 */
export function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * Validates a join code format
 * @param code - Join code to validate
 * @returns True if code is valid (6-12 alphanumeric characters)
 */
export function isValidJoinCode(code: string): boolean {
  return /^[A-Z0-9]{6,12}$/.test(code.toUpperCase())
}

/**
 * Gets the GitHub releases URL for downloading the proxy agent
 * @returns GitHub releases URL
 */
export function getGitHubReleaseUrl(): string {
  return `${config.githubRepo}/releases/latest`
}

/**
 * Gets the application name with optional custom branding
 * @returns Application name string
 */
export function getAppName(): string {
  return config.appName
}

/**
 * Gets the application version
 * @returns Version string
 */
export function getAppVersion(): string {
  return config.appVersion
}

/**
 * Gets the complete application identifier (name + version)
 * @returns Formatted app identifier
 */
export function getAppIdentifier(): string {
  return `${config.appName} ${config.appVersion}`
}

export default config
