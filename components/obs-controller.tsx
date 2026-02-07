"use client"

import type React from "react"
import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import OBSWebSocket from "obs-websocket-js"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription as AlertDialogDesc,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { OBSWebSocketAdapter } from "@/lib/obs-adapter"
import { getLocaleStrings, LocaleStrings, Language } from "@/lib/locales"
import { getWorkerUrl, getGitHubReleaseUrl, config } from "@/lib/config"
import {
  Mic,
  Eye,
  Video,
  Clapperboard,
  Circle,
  Globe,
  Zap,
  Plus,
  Settings,
  Wifi,
  WifiOff,
  Moon,
  Sun,
  Heart,
  CheckCircle2,
  XCircle,
  Loader2,
  HelpCircle,
  Monitor,
  Shield,
  HardDrive,
  Lock,
  Palette,
  Download,
  Terminal,
  Apple,
  Copy,
  Trash2,
  RefreshCw,
} from "lucide-react"

type ButtonType = "Mute" | "Visibility" | "Filter" | "Scene" | "Record" | "Stream"

interface DeckButton {
  label: string
  type: ButtonType
  target?: string
  filter?: string
  color: string
  colorActive?: string
  muted?: boolean
  id: string
}

// Centralized OBS State Store - Single Source of Truth
interface OBSState {
  scenes: { sceneName: string }[]
  inputs: { inputName: string }[]
  allSources: string[]
  rec: boolean
  str: boolean
  currentScene: string
  muteStates: Record<string, boolean>
  visibilityStates: Record<string, boolean>
  filterStates: Record<string, boolean>
  lastUpdate: number
}

const createInitialOBSState = (): OBSState => ({
  scenes: [],
  inputs: [],
  allSources: [],
  rec: false,
  str: false,
  currentScene: "",
  muteStates: {},
  visibilityStates: {},
  filterStates: {},
  lastUpdate: Date.now(),
})

const COLOR_PRESETS = [
  { value: "#18181b", active: "#3b82f6", label: "Dark" },
  { value: "#1e293b", active: "#60a5fa", label: "Slate" },
  { value: "#22c55e", active: "#16a34a", label: "Green" },
  { value: "#ef4444", active: "#dc2626", label: "Red" },
  { value: "#3b82f6", active: "#2563eb", label: "Blue" },
  { value: "#eab308", active: "#ca8a04", label: "Yellow" },
  { value: "#8b5cf6", active: "#7c3aed", label: "Purple" },
  { value: "#ec4899", active: "#db2777", label: "Pink" },
  { value: "#f97316", active: "#ea580c", label: "Orange" },
  { value: "#06b6d4", active: "#0891b2", label: "Cyan" },
]

const generateId = () => Math.random().toString(36).substring(2, 9)

// Master controls are always persistent at the top with distinct colors
const MASTER_CONTROLS: DeckButton[] = [
  { id: "master-mic", label: "MIC", type: "Mute", target: "Mic/Aux", color: "#7c2d12", colorActive: "#f97316" },      // Orange theme
  { id: "master-desktop", label: "DESKTOP", type: "Mute", target: "Desktop Audio", color: "#713f12", colorActive: "#eab308" }, // Amber theme
  { id: "master-rec", label: "REC", type: "Record", color: "#450a0a", colorActive: "#dc2626" },     // Red theme
  { id: "master-stream", label: "STREAM", type: "Stream", color: "#0c4a6e", colorActive: "#0ea5e9" }, // Blue theme
]

const DEFAULT_DECK: DeckButton[] = [...MASTER_CONTROLS]

const DECK_STORAGE_KEY = "dfl_deck"
const PAIRING_CODE_KEY = "dfl_pairing_code"

function getInitialDeck(): DeckButton[] {
  if (typeof window === "undefined") return [...MASTER_CONTROLS]
  try {
    const saved = window.localStorage.getItem(DECK_STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      // Ensure master controls are always present at the top
      const userButtons = parsed.filter((btn: DeckButton) => !btn.id.startsWith("master-"))
      return [...MASTER_CONTROLS, ...userButtons]
    }
  } catch {
    console.error("Failed to load deck from localStorage")
  }
  return [...MASTER_CONTROLS]
}

function getIcon(type: ButtonType) {
  const icons: Record<ButtonType, React.ReactNode> = {
    Mute: <Mic className="h-7 w-7" />,
    Visibility: <Eye className="h-7 w-7" />,
    Filter: <Video className="h-7 w-7" />,
    Scene: <Clapperboard className="h-7 w-7" />,
    Record: <Circle className="h-7 w-7" />,
    Stream: <Globe className="h-7 w-7" />,
  }
  return icons[type] || <Zap className="h-7 w-7" />
}

function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="currentColor" aria-hidden="true">
      <rect x="4" y="8" width="40" height="32" rx="6" strokeWidth="2" stroke="currentColor" fill="none" />
      <circle cx="14" cy="24" r="4" />
      <circle cx="24" cy="24" r="4" />
      <circle cx="34" cy="24" r="4" />
      <rect x="10" y="32" width="8" height="4" rx="1" />
      <rect x="20" y="32" width="8" height="4" rx="1" />
      <rect x="30" y="32" width="8" height="4" rx="1" />
    </svg>
  )
}

function getInitialPairingCode(): string {
    if (typeof window === "undefined") return ""
    return window.localStorage.getItem(PAIRING_CODE_KEY) || ""
  }

  function getInitialLang(): Language {
    if (typeof window === "undefined") return "en"
    const saved = window.localStorage.getItem("dfl_lang")
    if (saved === "en" || saved === "es") return saved
    const browserLang = navigator.language?.toLowerCase() || ""
    if (browserLang.startsWith("es")) return "es"
    return "en"
  }

  function getInitialUserOS(): "windows" | "macos" | "linux" | "other" {
    if (typeof window === "undefined") return "other"
    const ua = navigator.userAgent.toLowerCase()
    if (ua.includes("windows")) return "windows"
    if (ua.includes("mac") || ua.includes("darwin")) return "macos"
    if (ua.includes("linux") || ua.includes("ubuntu") || ua.includes("fedora") || ua.includes("debian")) return "linux"
    return "other"
  }

  export function OBSController() {
  const obsRef = useRef<OBSWebSocket | null>(null)
  const workerRef = useRef<WebSocket | null>(null)
  const [deck, setDeck] = useState<DeckButton[]>(getInitialDeck)
  const [connected, setConnected] = useState(false)
  const [lang, setLang] = useState<Language>(getInitialLang)
  const [strings, setStrings] = useState<LocaleStrings>(() => getLocaleStrings(getInitialLang()))
  const [obsState, setObsState] = useState<OBSState>(createInitialOBSState)
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [securityOpen, setSecurityOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [currentIdx, setCurrentIdx] = useState<number | null>(null)
  const [formData, setFormData] = useState<DeckButton>({
    id: "",
    label: "",
    type: "Mute",
    target: "",
    filter: "",
    color: "#18181b",
    colorActive: "#3b82f6",
  })
  const [filters, setFilters] = useState<string[]>([])
  const [wsUrl, setWsUrl] = useState("ws://127.0.0.1:4455")
  const [wsPassword, setWsPassword] = useState("")
  const [joinCode, setJoinCode] = useState(getInitialPairingCode)
  const [storedPairingCode, setStoredPairingCode] = useState(getInitialPairingCode)
  const [showControlPanel, setShowControlPanel] = useState(() => {
    if (typeof window === "undefined") return false
    // Show control panel immediately if we have a pairing code or saved deck
    const hasPairingCode = !!window.localStorage.getItem(PAIRING_CODE_KEY)
    const hasDeck = !!window.localStorage.getItem(DECK_STORAGE_KEY)
    return hasPairingCode || hasDeck
  })
  const [isClient, setIsClient] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined") return true
    const savedTheme = window.localStorage.getItem("dfl_theme")
    if (savedTheme === "light") return false
    if (savedTheme === "dark") return true
    return true // Default to dark
  })
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [adapter, setAdapter] = useState<OBSWebSocketAdapter | null>(null)
  const [userOS, setUserOS] = useState<"windows" | "macos" | "linux" | "other">(() => getInitialUserOS())
  const [isRemoteMode, setIsRemoteMode] = useState(false)
  const [isRemoteConnected, setIsRemoteConnected] = useState(false)
  const [connectionMode, setConnectionMode] = useState<"local" | "remote" | "none" | "dual" | "bridge">(() => {
    if (typeof window === "undefined") return "none"
    return window.localStorage.getItem("dfl_pairing_code") ? "remote" : "none"
  })
  const [isMobile, setIsMobile] = useState(false)
  const [isClientMode, setIsClientMode] = useState(() => {
    if (typeof window === "undefined") return false
    return !!window.localStorage.getItem("dfl_pairing_code")
  })
  const [remoteWaitingForAgent, setRemoteWaitingForAgent] = useState(false)
  const [remoteConnectionFailed, setRemoteConnectionFailed] = useState(false)
  const [hasOBSData, setHasOBSData] = useState(false)
  const [obsDataError, setObsDataError] = useState<string | null>(null)
const remoteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isRemoteModeRef = useRef(false)
  const connectionModeRef = useRef<"local" | "remote" | "none" | "dual" | "bridge">("none")

  // Persist deck changes to localStorage
  useEffect(() => {
    if (!isClient || deck.length === 0) return
    try {
      window.localStorage.setItem(DECK_STORAGE_KEY, JSON.stringify(deck))
    } catch {
      console.error("Failed to save deck to localStorage")
    }
  }, [deck, isClient])

  // Persist theme changes to localStorage
  useEffect(() => {
    if (!isClient) return
    try {
      window.localStorage.setItem("dfl_theme", isDark ? "dark" : "light")
    } catch {
      console.error("Failed to save theme to localStorage")
    }
  }, [isDark, isClient])

  // Auto-connect on mount if pairing code exists
  useEffect(() => {
    if (typeof window === "undefined") return
    setIsClient(true)

    const savedCode = window.localStorage.getItem(PAIRING_CODE_KEY)
    if (savedCode && !connected && !isConnecting) {
      // Set showControlPanel to true immediately to prevent pairing screen flash
      setShowControlPanel(true)
      setJoinCode(savedCode)
      setStoredPairingCode(savedCode)
      setIsRemoteMode(true)
      setIsClientMode(true)
      // Small delay to ensure state is set before connecting
      setTimeout(() => {
        connectToWorker()
      }, 100)
    }
  }, [])

  useEffect(() => {
    if (!isClient || !joinCode) return
    window.localStorage.setItem(PAIRING_CODE_KEY, joinCode)
  }, [joinCode, isClient])

  const RELEASE_VERSION = "v0.1.0-alpha"

  const getDownloadUrl = (os: "windows" | "macos" | "linux") => {
    const urls = {
      windows: `https://github.com/daurydicaprio/dockforlife/releases/download/${RELEASE_VERSION}/dockforlife-win.exe`,
      macos: `https://github.com/daurydicaprio/dockforlife/releases/download/${RELEASE_VERSION}/dockforlife-macos`,
      linux: `https://github.com/daurydicaprio/dockforlife/releases/download/${RELEASE_VERSION}/dockforlife-linux`,
    }
    return urls[os]
  }

  const downloadInstructions = {
    windows: {
      title: "Windows",
      steps: [
        "Download dockforlife-win.exe",
        "Double-click the downloaded file",
        "The agent will start automatically",
        "Use the code shown to connect from your phone",
      ],
    },
    macos: {
      title: "macOS",
      steps: [
        "Download dockforlife-macos",
        "Open Terminal and run: chmod +x dockforlife-macos",
        "Run the agent: ./dockforlife-macos",
        "Use the code shown to connect from your phone",
      ],
    },
    linux: {
      title: "Linux",
      steps: [
        "Download dockforlife-linux",
        "Open Terminal in the download folder",
        "Run: chmod +x dockforlife-linux",
        "Run: ./dockforlife-linux",
        "Use the code shown to connect from your phone",
      ],
    },
  }

  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false)
  const [selectedOS, setSelectedOS] = useState<"windows" | "macos" | "linux">("windows")
  const [clearConnectionDialogOpen, setClearConnectionDialogOpen] = useState(false)

  const handleDownloadClick = (os: "windows" | "macos" | "linux") => {
    setSelectedOS(os)
    setDownloadDialogOpen(true)
  }

  const proceedDownload = () => {
    window.open(getDownloadUrl(selectedOS), "_blank")
    setDownloadDialogOpen(false)
  }

  const changeLanguage = useCallback((newLang: Language) => {
    setLang(newLang)
    setStrings(getLocaleStrings(newLang))
    if (typeof window !== "undefined") {
      window.localStorage.setItem("dfl_lang", newLang)
    }
  }, [])

  const confirmClearConnection = useCallback(() => {
    window.localStorage.removeItem(PAIRING_CODE_KEY)
    setStoredPairingCode("")
    setJoinCode("")
    setConnectionMode("none")
    setIsRemoteMode(false)
    setRemoteWaitingForAgent(false)
    setIsRemoteConnected(false)
    setClearConnectionDialogOpen(false)
    showToast(strings.toasts.disconnected, "success")
  }, [strings])

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 2000)
  }, [])

  const startRemoteTimeout = useCallback(() => {
    if (remoteTimeoutRef.current) clearTimeout(remoteTimeoutRef.current)
    remoteTimeoutRef.current = setTimeout(() => setRemoteConnectionFailed(true), config.connectionTimeout / 2)
  }, [])

  const disconnectWorker = useCallback(() => {
    if (workerRef.current) {
      try { workerRef.current.close() } catch {}
      workerRef.current = null
    }
    setIsRemoteConnected(false)
    setRemoteWaitingForAgent(false)
  }, [])

  // Factory Reset - clears all localStorage and reloads the page
  const handleFactoryReset = useCallback(() => {
    if (typeof window === "undefined") return

    // Disconnect everything first
    disconnectWorker()
    if (obsRef.current) {
      try { obsRef.current.disconnect() } catch {}
      obsRef.current = null
    }

    // Clear all localStorage
    window.localStorage.removeItem(PAIRING_CODE_KEY)
    window.localStorage.removeItem(DECK_STORAGE_KEY)
    window.localStorage.removeItem("dfl_ws_url")
    window.localStorage.removeItem("dfl_ws_pass")
    window.localStorage.removeItem("dfl_lang")
    window.localStorage.removeItem("dfl_theme")

    showToast("Factory reset completed. Reloading...", "success")

    // Reload the page after a short delay to ensure the toast is shown
    setTimeout(() => {
      window.location.reload()
    }, 1000)
  }, [disconnectWorker, showToast])

  // Fetch initial OBS state for mobile data handshake
  const fetchInitialOBSState = useCallback(() => {
    if (!workerRef.current || workerRef.current.readyState !== WebSocket.OPEN) {
      console.error("Cannot fetch initial state: WebSocket not open")
      return
    }

    console.log("Requesting initial OBS state from agent...")
    
    // Request scenes list
    workerRef.current.send(JSON.stringify({
      type: "obs_command",
      command: "GetSceneList"
    }))

    // Request input list for mute states
    workerRef.current.send(JSON.stringify({
      type: "obs_command",
      command: "GetInputList"
    }))

    // Request record status
    workerRef.current.send(JSON.stringify({
      type: "obs_command",
      command: "GetRecordStatus"
    }))

    // Request stream status
    workerRef.current.send(JSON.stringify({
      type: "obs_command",
      command: "GetStreamStatus"
    }))

    // Request current program scene
    workerRef.current.send(JSON.stringify({
      type: "obs_command",
      command: "GetCurrentProgramScene"
    }))
  }, [])

  const connectToWorker = useCallback(async () => {
    const workerUrl = getWorkerUrl()
    const code = joinCode.trim().toUpperCase()

    if (code.length < 4) {
      showToast("Enter a valid code (4+ chars)", "error")
      return
    }

    if (isRemoteConnected && workerRef.current) return

    disconnectWorker()
    setIsConnecting(true)
    setRemoteWaitingForAgent(false)
    setRemoteConnectionFailed(false)

    try {
      const url = new URL(workerUrl)
      url.searchParams.set("code", code)
      url.searchParams.set("role", "client")

      const ws = new WebSocket(url.toString())
      workerRef.current = ws

      ws.onopen = () => {
        setIsRemoteConnected(true)
        setConnected(true)
        setConnectionMode("remote")
        setIsConnecting(false)
        setRemoteWaitingForAgent(true)
        ws.send(JSON.stringify({ type: "register", code: code, role: "client" }))
      }

      ws.onmessage = (event) => {
        console.log("RAW DATA RECEIVED:", event.data)
        try {
          const raw = event.data
          const data = JSON.parse(raw as string)

          if (data.type === "waiting") {
            setRemoteWaitingForAgent(true)
            startRemoteTimeout()
          } else if (data.type === "peer_connected") {
            setRemoteWaitingForAgent(false)
            showToast(strings.toasts.connected, "success")
            // Trigger initial state fetch after peer connection is established
            setTimeout(() => {
              fetchInitialOBSState()
            }, 500)
          } else if (data.type === "obs-data" || data.type === "obs_data") {
            console.log("OBS DATA RECEIVED:", JSON.stringify(data, null, 2))
            
            setObsDataError(null)
            const scenes = Array.isArray(data.scenes) ? data.scenes : []
            const inputs = Array.isArray(data.inputs) ? data.inputs : []
            const currentScene = data.currentScene || ""
            
            console.log("Processing scenes:", scenes.length, "inputs:", inputs.length)
            
            setObsState((prev: OBSState) => ({ 
              ...prev, 
              scenes, 
              inputs,
              allSources: [...scenes.map((s: { sceneName: string }) => s.sceneName), ...inputs.map((i: { inputName: string }) => i.inputName)],
              lastUpdate: Date.now()
            }))
            
            if (scenes.length > 0 || inputs.length > 0) {
              setRemoteWaitingForAgent(false)
              setHasOBSData(true)
            }
            
            setDeck((prev) => prev.map((btn) => {
              if (btn.type === "Mute") {
                if (btn.target === "Desktop Audio" || btn.target === "Audio del escritorio") {
                  const found = inputs.find((i: { inputName: string }) => 
                    i && i.inputName && (i.inputName.toLowerCase().includes("desktop") || i.inputName.toLowerCase().includes("audio"))
                  )
                  if (found) return { ...btn, target: found.inputName }
                }
                if (btn.target === "Mic/Aux" || btn.target === "Mic") {
                  const found = inputs.find((i: { inputName: string }) => 
                    i && i.inputName && (i.inputName.toLowerCase().includes("mic") || i.inputName.toLowerCase().includes("aux"))
                  )
                  if (found) return { ...btn, target: found.inputName }
                }
              }
              return btn
            }))
            
            setSettingsOpen(false)
            setModalOpen(false)
          } else if (data.type === "obs_status") {
            setObsState((prev: OBSState) => ({ 
              ...prev, 
              rec: data.rec, 
              str: data.str,
              muteStates: data.muteStates && typeof data.muteStates === "object" ? data.muteStates : prev.muteStates,
              currentScene: data.currentScene && typeof data.currentScene === "string" ? data.currentScene : prev.currentScene,
              visibilityStates: data.visibilityStates && typeof data.visibilityStates === "object" ? data.visibilityStates : prev.visibilityStates,
              filterStates: data.filterStates && typeof data.filterStates === "object" ? data.filterStates : prev.filterStates,
              lastUpdate: Date.now()
            }))
          } else if (data.type === "obs_event") {
            // Handle real-time OBS events from agent
            const eventType = data.eventType
            const eventData = data.eventData
            
            if (eventType === "InputMuteStateChanged" && eventData) {
              setObsState((prev: OBSState) => ({
                ...prev,
                muteStates: { ...prev.muteStates, [eventData.inputName]: eventData.inputMuted },
                lastUpdate: Date.now()
              }))
            } else if (eventType === "RecordStateChanged" && eventData) {
              setObsState((prev: OBSState) => ({
                ...prev,
                rec: eventData.outputState === "OBS_WEBSOCKET_OUTPUT_STATE_STARTED",
                lastUpdate: Date.now()
              }))
            } else if (eventType === "StreamStateChanged" && eventData) {
              setObsState((prev: OBSState) => ({
                ...prev,
                str: eventData.outputState === "OBS_WEBSOCKET_OUTPUT_STATE_STARTED",
                lastUpdate: Date.now()
              }))
            } else if (eventType === "CurrentProgramSceneChanged" && eventData) {
              setObsState((prev: OBSState) => ({
                ...prev,
                currentScene: eventData.sceneName,
                lastUpdate: Date.now()
              }))
            }
          } else if (data.type === "error") {
            showToast(data.message || strings.toasts.connectionError, "error")
            setIsConnecting(false)
          }
        } catch (e) {
          console.error("WebSocket message error:", e)
        }
      }

      ws.onerror = () => {
        setIsConnecting(false)
        showToast(strings.toasts.connectionError, "error")
      }

      ws.onclose = () => {
        setIsRemoteConnected(false)
        workerRef.current = null
        if (!connected) setConnected(false)
      }
    } catch (error) {
      setIsConnecting(false)
      showToast(strings.toasts.connectionError, "error")
    }
  }, [joinCode, showToast, strings, isRemoteConnected, connected, startRemoteTimeout, disconnectWorker])

  const connectOBS = useCallback(async () => {
    if (obsRef.current) {
      try { obsRef.current.disconnect() } catch {}
      obsRef.current = null
    }

    setIsConnecting(true)
    setRemoteConnectionFailed(false)
    setConnected(false)
    setConnectionMode("none")

    const obs = new OBSWebSocket()
    obsRef.current = obs

    try {
      await obs.connect(wsUrl, wsPassword || undefined, { rpcVersion: 1 })
      setConnected(true)
      setConnectionMode("local")
      setSettingsOpen(false)
      setModalOpen(false)
      showToast(strings.toasts.connected, "success")

      const special = await obs.call("GetSpecialInputs")
      setDeck((prev) => prev.map((btn) => {
        if (btn.target === "Desktop Audio" && special.desktop1) return { ...btn, target: special.desktop1 as string }
        if (btn.target === "Mic/Aux" && special.mic1) return { ...btn, target: special.mic1 as string }
        return btn
      }))

      const [sceneList, inputList] = await Promise.all([obs.call("GetSceneList"), obs.call("GetInputList")])

      const sourceSet = new Set<string>()
      inputList.inputs.forEach((i) => sourceSet.add(i.inputName as string))

      for (const scene of sceneList.scenes) {
        try {
          const { sceneItems } = await obs.call("GetSceneItemList", { sceneName: scene.sceneName as string })
          sceneItems.forEach((si) => sourceSet.add(si.sourceName as string))
        } catch {}
      }

      // Get current scene
      const { currentProgramSceneName } = await obs.call("GetCurrentProgramScene")

      // INITIAL SYNC: Fetch all input mute states
      const initialMuteStates: Record<string, boolean> = {}
      for (const input of inputList.inputs) {
        try {
          const { inputMuted } = await obs.call("GetInputMute", { inputName: input.inputName as string })
          initialMuteStates[input.inputName as string] = inputMuted
        } catch {
          // Skip inputs that don't support mute
        }
      }

      // INITIAL SYNC: Fetch recording and streaming status
      let recStatus = false
      let strStatus = false
      try {
        const [recResult, streamResult] = await Promise.all([
          obs.call("GetRecordStatus"),
          obs.call("GetStreamStatus")
        ])
        recStatus = recResult.outputActive as boolean
        strStatus = streamResult.outputActive as boolean
      } catch {
        console.error("Failed to get initial record/stream status")
      }

      // Set centralized state with all initial data
      setObsState({
        scenes: sceneList.scenes as { sceneName: string }[],
        inputs: inputList.inputs as { inputName: string }[],
        allSources: Array.from(sourceSet).sort(),
        rec: recStatus,
        str: strStatus,
        currentScene: currentProgramSceneName as string,
        muteStates: initialMuteStates,
        visibilityStates: {},
        filterStates: {},
        lastUpdate: Date.now()
      })

      const obsAdapter = new OBSWebSocketAdapter(obs)
      setAdapter(obsAdapter)

      // Set up OBS event listeners to update centralized state
      ;(obs as any).on("CurrentProgramSceneChanged", (data: unknown) => {
        const d = data as { sceneName: string }
        console.log("Scene changed:", d.sceneName)
        setObsState((prev: OBSState) => ({ ...prev, currentScene: d.sceneName, lastUpdate: Date.now() }))
      })

      ;(obs as any).on("SourceMuteStateChanged", (data: unknown) => {
        const d = data as { inputName: string; inputMuted: boolean }
        console.log("Mute state changed:", d.inputName, d.inputMuted)
        setObsState((prev: OBSState) => ({ 
          ...prev, 
          muteStates: { ...prev.muteStates, [d.inputName]: d.inputMuted },
          lastUpdate: Date.now()
        }))
      })

      ;(obs as any).on("RecordingStateChanged", (data: unknown) => {
        const d = data as { outputState: string }
        console.log("Recording state changed:", d.outputState)
        setObsState((prev: OBSState) => ({ 
          ...prev, 
          rec: d.outputState === "OBS_WEBSOCKET_OUTPUT_STATE_STARTED",
          lastUpdate: Date.now()
        }))
      })

      ;(obs as any).on("StreamStateChanged", (data: unknown) => {
        const d = data as { outputState: string }
        console.log("Stream state changed:", d.outputState)
        setObsState((prev: OBSState) => ({ 
          ...prev, 
          str: d.outputState === "OBS_WEBSOCKET_OUTPUT_STATE_STARTED",
          lastUpdate: Date.now()
        }))
      })

      ;(obs as any).on("SceneItemEnableStateChanged", (data: unknown) => {
        const d = data as { sceneName: string; sceneItemId: number; sceneItemEnabled: boolean }
        console.log("Visibility changed:", d.sceneName, d.sceneItemId, d.sceneItemEnabled)
        setObsState((prev: OBSState) => ({ 
          ...prev, 
          visibilityStates: { ...prev.visibilityStates, [`${d.sceneName}-${d.sceneItemId}`]: d.sceneItemEnabled },
          lastUpdate: Date.now()
        }))
      })

      ;(obs as any).on("SourceFilterEnableStateChanged", (data: unknown) => {
        const d = data as { sourceName: string; filterName: string; filterEnabled: boolean }
        console.log("Filter state changed:", d.sourceName, d.filterName, d.filterEnabled)
        setObsState((prev: OBSState) => ({ 
          ...prev, 
          filterStates: { ...prev.filterStates, [`${d.sourceName}-${d.filterName}`]: d.filterEnabled },
          lastUpdate: Date.now()
        }))
      })

      localStorage.setItem("dfl_ws_url", wsUrl)
      localStorage.setItem("dfl_ws_pass", wsPassword)
    } catch {
      setConnected(false)
      setConnectionMode("none")
      showToast(strings.toasts.connectionError, "error")
    } finally {
      setIsConnecting(false)
    }
  }, [wsUrl, wsPassword, showToast, strings])

  useEffect(() => {
    const savedUrl = localStorage.getItem("dfl_ws_url")
    const savedRemoteMode = localStorage.getItem("dfl_remote_mode")
    if (savedUrl && savedRemoteMode !== "true") connectOBS()
  }, [])

  useEffect(() => {
    if (!connected) return

    let interval: ReturnType<typeof setInterval>

    if (connectionMode === "remote" && isRemoteConnected) {
      const syncRemoteStates = async () => {
        try {
          if (workerRef.current?.readyState !== WebSocket.OPEN) return
          workerRef.current.send(JSON.stringify({ type: "request_status" }))
        } catch {}
      }
      interval = setInterval(syncRemoteStates, 5000)
    } else if (obsRef.current && connectionMode === "local") {
      const syncStates = async () => {
        try {
          const obs = obsRef.current
          if (!obs) return

          // Sync recording and streaming status
          const [recStatus, streamStatus] = await Promise.all([obs.call("GetRecordStatus"), obs.call("GetStreamStatus")])

          // Sync current scene
          const { currentProgramSceneName } = await obs.call("GetCurrentProgramScene")

          // Sync all button states
          const newMuteStates: Record<string, boolean> = { ...obsState.muteStates }
          const newVisibilityStates: Record<string, boolean> = { ...obsState.visibilityStates }
          const newFilterStates: Record<string, boolean> = { ...obsState.filterStates }

          for (const btn of deck) {
            if (btn.type === "Mute" && btn.target) {
              try {
                const { inputMuted } = await obs.call("GetInputMute", { inputName: btn.target })
                newMuteStates[btn.target] = inputMuted
              } catch {}
            } else if (btn.type === "Visibility" && btn.target) {
              try {
                const { sceneItems } = await obs.call("GetSceneItemList", { sceneName: currentProgramSceneName as string })
                const item = (sceneItems as Array<{ sourceName: string; sceneItemId: number }>).find((i) => i.sourceName === btn.target)
                if (item) {
                  const { sceneItemEnabled } = await obs.call("GetSceneItemEnabled", {
                    sceneName: currentProgramSceneName as string,
                    sceneItemId: item.sceneItemId as number
                  })
                  newVisibilityStates[btn.target] = sceneItemEnabled
                }
              } catch {}
            } else if (btn.type === "Filter" && btn.target && btn.filter) {
              try {
                const { filterEnabled } = await obs.call("GetSourceFilter", {
                  sourceName: btn.target,
                  filterName: btn.filter
                })
                newFilterStates[`${btn.target}-${btn.filter}`] = filterEnabled
              } catch {}
            }
          }

          // Update centralized state atomically
          setObsState((prev: OBSState) => ({
            ...prev,
            rec: recStatus.outputActive as boolean,
            str: streamStatus.outputActive as boolean,
            currentScene: currentProgramSceneName as string,
            muteStates: newMuteStates,
            visibilityStates: newVisibilityStates,
            filterStates: newFilterStates,
            lastUpdate: Date.now()
          }))
        } catch {}
      }
      interval = setInterval(syncStates, 1500)
    }

    return () => { if (interval) clearInterval(interval) }
  }, [connected, connectionMode, isRemoteConnected, deck])

  const execute = useCallback(async (btn: DeckButton) => {
    if (connectionMode === "remote") {
      if (!hasOBSData) {
        showToast("Loading OBS data...", "error")
        return
      }
      if (workerRef.current?.readyState === WebSocket.OPEN) {
        const command = {
          type: "obs_command",
          command: btn.type,
          args: { ...(btn.target && { target: btn.target }), ...(btn.filter && { filter: btn.filter }) },
        }
        if (btn.type === "Mute" && btn.target) {
          const targetName = btn.target
          // Optimistically update local state for immediate UI feedback
          setObsState((prev: OBSState) => ({
            ...prev,
            muteStates: { ...prev.muteStates, [targetName]: !Boolean(prev.muteStates[targetName]) },
            lastUpdate: Date.now()
          }))
        }
        workerRef.current.send(JSON.stringify(command))
        return
      }
    }

    if (!obsRef.current || !connected) {
      showToast(strings.toasts.connectionError, "error")
      return
    }

    const obs = obsRef.current

    try {
      switch (btn.type) {
        case "Record": await obs.call("ToggleRecord"); break
        case "Stream": await obs.call("ToggleStream"); break
        case "Scene": if (btn.target) await obs.call("SetCurrentProgramScene", { sceneName: btn.target }); break
        case "Mute": if (btn.target) await obs.call("ToggleInputMute", { inputName: btn.target }); break
        case "Filter":
          if (btn.target && btn.filter) {
            const { filterEnabled } = await obs.call("GetSourceFilter", { sourceName: btn.target, filterName: btn.filter })
            await obs.call("SetSourceFilterEnabled", { sourceName: btn.target, filterName: btn.filter, filterEnabled: !filterEnabled })
          }
          break
        case "Visibility":
          if (btn.target) {
            const { currentProgramSceneName } = await obs.call("GetCurrentProgramScene")
            const { sceneItems } = await obs.call("GetSceneItemList", { sceneName: currentProgramSceneName })
            const item = sceneItems.find((i) => i.sourceName === btn.target)
            if (item) {
              const { sceneItemEnabled } = await obs.call("GetSceneItemEnabled", { sceneName: currentProgramSceneName, sceneItemId: item.sceneItemId as number })
              await obs.call("SetSceneItemEnabled", { sceneName: currentProgramSceneName, sceneItemId: item.sceneItemId as number, sceneItemEnabled: !sceneItemEnabled })
            } else {
              showToast(strings.toasts.connectionError, "error")
            }
          }
          break
      }
    } catch {
      showToast(strings.toasts.connectionError, "error")
    }
  }, [connected, showToast, connectionMode, hasOBSData, strings])

  const loadFilters = useCallback(async (sourceName: string) => {
    if (!obsRef.current || !sourceName) { setFilters([]); return }
    try {
      const { filters: filterList } = await obsRef.current.call("GetSourceFilterList", { sourceName })
      setFilters(filterList.map((f) => f.filterName as string))
    } catch { setFilters([]) }
  }, [])

  const openModal = (index: number) => {
    setCurrentIdx(index)
    const btn = deck[index] || { id: generateId(), label: "", type: "Mute" as ButtonType, target: "", filter: "", color: "#18181b", colorActive: "#3b82f6" }
    setFormData(btn)
    if (btn.type === "Filter" && btn.target) loadFilters(btn.target)
    setModalOpen(true)
  }

  const saveButton = () => {
    if (currentIdx === null) return
    const newBtn: DeckButton = {
      id: formData.id || generateId(),
      label: formData.label || "BTN",
      type: formData.type,
      target: formData.target,
      filter: formData.filter,
      color: formData.color,
      colorActive: formData.colorActive,
    }
    setDeck((prev) => { const updated = [...prev]; updated[currentIdx] = newBtn; return updated })
    setModalOpen(false)
    showToast(strings.toasts.saved, "success")
  }

  const deleteButton = () => {
    if (currentIdx === null) return
    setDeck((prev) => prev.filter((_, i) => i !== currentIdx))
    setModalOpen(false)
    setDeleteDialogOpen(false)
    showToast(strings.toasts.deleted, "success")
  }

  // Double tap detection for editing
  const lastTapRef = useRef<{ index: number; time: number } | null>(null)
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null)
  const isDraggingRef = useRef(false)
  
  const handleTouchStart = (index: number, e: React.TouchEvent) => {
    const touch = e.touches[0]
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY }
    isDraggingRef.current = false
  }
  
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPosRef.current) return
    const touch = e.touches[0]
    const dx = Math.abs(touch.clientX - touchStartPosRef.current.x)
    const dy = Math.abs(touch.clientY - touchStartPosRef.current.y)
    if (dx > 5 || dy > 5) {
      isDraggingRef.current = true
    }
  }
  
  const handleTouchEnd = (index: number) => {
    const now = Date.now()
    if (lastTapRef.current && lastTapRef.current.index === index && now - lastTapRef.current.time < 300) {
      // Double tap detected
      openModal(index)
      lastTapRef.current = null
    } else {
      lastTapRef.current = { index, time: now }
    }
    touchStartPosRef.current = null
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    // Cancel any pending tap
    lastTapRef.current = null
    setDraggedIdx(index)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", index.toString())
    const target = e.currentTarget as HTMLElement
    if (target) {
      target.style.opacity = "0.5"
    }
  }

  const handleDragOver = (e: React.DragEvent, index: number) => { 
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = "move"
    setDragOverIdx(index) 
  }
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation()
    setDragOverIdx(null)
  }
  
  const handleDragEnd = (e: React.DragEvent) => {
    const target = e.currentTarget as HTMLElement
    if (target) {
      target.style.opacity = "1"
    }
    setDraggedIdx(null)
    setDragOverIdx(null)
  }

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    e.stopPropagation()
    if (draggedIdx === null || draggedIdx === dropIndex) { 
      setDraggedIdx(null)
      setDragOverIdx(null)
      return 
    }
    const newDeck = [...deck]
    const [draggedItem] = newDeck.splice(draggedIdx, 1)
    newDeck.splice(dropIndex, 0, draggedItem)
    setDeck(newDeck)
    setDraggedIdx(null)
    setDragOverIdx(null)
    showToast(strings.toasts.orderUpdated, "success")
  }
  
  const triggerHaptic = () => {
    if (typeof window !== "undefined" && window.navigator.vibrate) {
      window.navigator.vibrate(50)
    }
  }

  const handleButtonClick = (btn: DeckButton, index: number) => {
    // Prevent click if we were dragging
    if (isDraggingRef.current) {
      isDraggingRef.current = false
      return
    }
    triggerHaptic()
    execute(btn)
  }

  const getTargetList = useMemo(() => {
    switch (formData.type) {
      case "Scene": return (obsState.scenes || []).map((s: { sceneName: string }) => s.sceneName)
      case "Mute": return (obsState.inputs || []).map((i: { inputName: string }) => i.inputName)
      default: return obsState.allSources || []
    }
  }, [formData.type, obsState])

  const needsTarget = !["Record", "Stream"].includes(formData.type)

  return (
    <div className={cn("min-h-screen flex flex-col transition-colors duration-300", isDark ? "bg-slate-950 text-white" : "bg-gray-50 text-gray-900")}>
      {/* Logo - Centered with mt-12 */}
      <div className="flex items-center justify-center gap-4 mt-12 mb-8">
        <Logo className={cn("h-20 w-20", isDark ? "text-white" : "text-gray-900")} />
        <h1 className={cn("text-3xl font-bold tracking-tight", isDark ? "text-white" : "text-gray-900")}>
          DOCK<span className="text-blue-500">FORLIFE</span>
        </h1>
      </div>

      {/* Connection Alerts */}
      {remoteConnectionFailed && (
        <div className="px-4 mb-4">
          <div className={cn("max-w-md mx-auto px-4 py-3 rounded-xl text-sm text-center border",
            isDark ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-amber-100 text-amber-700 border-amber-200")}>
            <span>{strings.toasts.agentNotRunning}</span>
            <a href={getGitHubReleaseUrl()} target="_blank" rel="noopener noreferrer" className={cn("ml-2 underline font-medium", isDark ? "text-amber-300" : "text-amber-600")}>{strings.agent.download}</a>
          </div>
        </div>
      )}

      {connectionMode === "remote" && !hasOBSData && (
        <div className="px-4 mb-4">
          <div className={cn("max-w-md mx-auto px-4 py-4 rounded-xl text-sm text-center border",
            isDark ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-blue-100 text-blue-700 border-blue-200")}>
            <div className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /><span>{strings.toasts.waitingForOBS}</span></div>
          </div>
        </div>
      )}

      {obsDataError && (
        <div className="px-4 mb-4">
          <div className={cn("max-w-md mx-auto px-4 py-4 rounded-xl text-sm text-center border",
            isDark ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-red-100 text-red-700 border-red-200")}>
            <span className="font-medium">{obsDataError}</span>
          </div>
        </div>
      )}

      {/* Dock Container */}
      <main className="flex-1 flex flex-col items-center px-4 pb-40">
        <div className="w-full max-w-5xl">
          {/* Glass Dock */}
          <div className={cn("backdrop-blur-md rounded-2xl p-8 border",
            isDark ? "bg-slate-900/60 border-white/10 shadow-lg shadow-black/20" : "bg-white/80 border-gray-200 shadow-md shadow-gray-200/50")}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
              {(deck || []).map((btn, i) => {
                // Check active state for each button type from centralized state
                const isRecording = btn.type === "Record" && obsState.rec
                const isStreaming = btn.type === "Stream" && obsState.str
                const isMuted = Boolean(btn.type === "Mute" && btn.target && obsState.muteStates[btn.target])
                const isActiveScene = btn.type === "Scene" && btn.target && obsState.currentScene === btn.target
                const isVisible = Boolean(btn.type === "Visibility" && btn.target && obsState.visibilityStates[btn.target])
                const isFilterEnabled = Boolean(btn.type === "Filter" && btn.target && btn.filter && obsState.filterStates[`${btn.target}-${btn.filter}`])

                // Button is active if it's in its active state
                const isActive = isRecording || isStreaming || isActiveScene || isVisible || isFilterEnabled || (btn.type === "Mute" && isMuted)
                const isDragging = draggedIdx === i
                const isDragOver = dragOverIdx === i

                // Determine background color
                let bgColor = btn.color
                if (isRecording) {
                  bgColor = "#dc2626" // Red for recording
                } else if (isStreaming) {
                  bgColor = "#16a34a" // Green for streaming
                } else if (isMuted) {
                  bgColor = btn.colorActive || "#3b82f6" // Use active color when muted
                } else if (isActiveScene || isVisible || isFilterEnabled) {
                  bgColor = btn.colorActive || "#3b82f6" // Use active color for active scene/visible source/enabled filter
                }

                // Determine text color based on background brightness
                const getTextColor = (hexColor: string) => {
                  // Remove # if present
                  const hex = hexColor.replace('#', '');
                  // Parse RGB values
                  const r = parseInt(hex.slice(0, 2), 16) || 0;
                  const g = parseInt(hex.slice(2, 4), 16) || 0;
                  const b = parseInt(hex.slice(4, 6), 16) || 0;
                  // Calculate brightness using YIQ formula
                  const brightness = ((r * 299) + (g * 587) + (b * 114)) / 1000;
                  // Return black for light backgrounds, white for dark backgrounds
                  return brightness > 128 ? '#000000' : '#ffffff';
                }
                
                const textColor = getTextColor(bgColor)

                return (
                  <div 
                    key={btn.id} 
                    draggable
                    onDragStart={(e) => handleDragStart(e, i)} 
                    onDragOver={(e) => handleDragOver(e, i)} 
                    onDragLeave={(e) => handleDragLeave(e)} 
                    onDrop={(e) => handleDrop(e, i)} 
                    onDragEnd={(e) => handleDragEnd(e)}
                    className={cn(
                      "cursor-grab active:cursor-grabbing transition-all duration-200 select-none",
                      isDragging && "opacity-50 scale-95", 
                      isDragOver && "scale-105 z-10"
                    )}
                  >
                     <button
                       className={cn(
                         "w-full min-h-[160px] sm:min-h-[180px] rounded-2xl flex flex-col items-center justify-center gap-4 transition-all duration-150 active:scale-[0.97] relative overflow-hidden touch-manipulation",
                         "border-2",
                         isActive
                           ? "border-black brightness-125 shadow-lg scale-[1.02]"
                           : isDark
                             ? "border-white/20 bg-zinc-800"
                             : "border-gray-300 bg-gray-100"
                       )}
                       style={{
                         backgroundColor: isActive ? bgColor : undefined,
                         color: isActive ? textColor : undefined
                       }}
                      onClick={() => handleButtonClick(btn, i)}
                      onContextMenu={(e) => { e.preventDefault(); openModal(i) }}
                      onTouchStart={(e) => handleTouchStart(i, e)} 
                      onTouchMove={handleTouchMove}
                      onTouchEnd={() => handleTouchEnd(i)}
                      aria-label={`${btn.label} button`}
                     >
                      {/* Icon centered */}
                      <div className="relative mt-2">
                        {getIcon(btn.type)}
                        {isMuted && <div className="absolute inset-0 flex items-center justify-center"><div className="w-full h-0.5 bg-current rotate-45 rounded-full" /></div>}
                      </div>
                      
                      {/* Label centered below */}
                      <span className="text-sm font-bold uppercase tracking-wider text-center px-3 leading-tight">{btn.label}</span>
                    </button>
                  </div>
                )
              })}

              {/* Add Button */}
              <button
                className={cn(
                  "min-h-[160px] sm:min-h-[180px] rounded-2xl border-2 border-dashed flex items-center justify-center transition-colors",
                  isDark
                    ? "border-white/20 text-zinc-500 hover:border-white/40 hover:text-zinc-300 bg-zinc-900/40"
                    : "border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-600 bg-gray-100/50"
                )}
                onClick={() => {
                  triggerHaptic()
                  openModal(deck.length)
                }}
                aria-label="Add new button"
              >
                <Plus className="h-10 w-10" />
              </button>
            </div>
          </div>

          {/* Hint text */}
          <p className={cn("mt-4 text-xs text-center", isDark ? "text-zinc-500" : "text-gray-500")}>Double tap to edit · Drag to reorder · Click to execute</p>
        </div>
      </main>

      {/* Floating Footer - Centered */}
      <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
        <div className="flex flex-col items-center gap-3">
          {/* Main Footer Bar */}
          <div className={cn("flex items-center gap-3 px-6 py-3 rounded-2xl backdrop-blur-md border shadow-2xl",
            isDark ? "bg-slate-900/80 border-white/10 shadow-black/50" : "bg-white/90 border-gray-200 shadow-gray-200/50")}>
            {/* Donate */}
            <a href="https://paypal.me/daurydicaprio" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium bg-gradient-to-r from-pink-500/20 to-rose-500/20 text-pink-500 hover:from-pink-500/30 hover:to-rose-500/30 transition-all border border-pink-500/20">
              <Heart className="h-3 w-3" /> {strings.footer.donate}
            </a>

            {/* Connection Status */}
            <div className={cn("flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold border",
              isConnecting
                ? isDark ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-amber-100 text-amber-700 border-amber-300"
                : connected
                  ? connectionMode === "remote"
                    ? isDark ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-blue-100 text-blue-700 border-blue-300"
                    : isDark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-emerald-100 text-emerald-700 border-emerald-300"
                  : isDark ? "bg-zinc-800/50 text-zinc-500 border-zinc-700/50" : "bg-gray-200 text-gray-500 border-gray-300")}>
              {isConnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              <span>{isConnecting ? strings.header.connecting : connected ? (connectionMode === "remote" ? strings.header.remote : strings.header.local) : strings.header.offline}</span>
            </div>

            {/* Security Button */}
            <button
              onClick={() => setSecurityOpen(true)}
              className={cn(
                "p-1.5 rounded-full border transition-all duration-200 hover:scale-105",
                isDark ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20" : "bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100"
              )}
              title={strings.security.title}
            >
              <Shield className="h-4 w-4" />
            </button>

            {/* Divider */}
            <div className={cn("w-px h-6", isDark ? "bg-white/10" : "bg-gray-300")} />

            {/* Controls */}
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className={cn("h-9 w-9 rounded-xl border", isDark ? "bg-white/5 hover:bg-white/10 border-white/5" : "bg-gray-100 hover:bg-gray-200 border-gray-200")} onClick={() => setIsDark(!isDark)}>
                {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-blue-600" />}
              </Button>
              <Button variant="ghost" size="icon" className={cn("h-9 w-9 rounded-xl border", isDark ? "bg-white/5 hover:bg-white/10 border-white/5" : "bg-gray-100 hover:bg-gray-200 border-gray-200")} onClick={() => setHelpOpen(true)}>
                <HelpCircle className={cn("h-4 w-4", isDark ? "text-zinc-400" : "text-gray-600")} />
              </Button>
              <Button variant="ghost" size="icon" className={cn("h-9 w-9 rounded-xl border", isDark ? "bg-white/5 hover:bg-white/10 border-white/5" : "bg-gray-100 hover:bg-gray-200 border-gray-200")} onClick={() => setSettingsOpen(true)}>
                <Settings className={cn("h-4 w-4", isDark ? "text-zinc-400" : "text-gray-600")} />
              </Button>
            </div>
          </div>
          
          {/* Brand Legend */}
          <div className="text-center">
            <p className={cn("text-xs", isDark ? "text-zinc-500" : "text-gray-500")}>
              Made with <span className="text-pink-500">♥</span> by <span className={cn("font-medium", isDark ? "text-zinc-300" : "text-gray-700")}>Daury DiCaprio</span>
            </p>
            <p className={cn("text-[10px] mt-0.5", isDark ? "text-zinc-600" : "text-gray-400")}>
              <a href="https://dock.daurydicaprio.com" target="_blank" rel="noopener noreferrer" className="hover:underline">dock.daurydicaprio.com</a>
            </p>
          </div>
        </div>
      </footer>

      {/* Security Dialog */}
      <Dialog open={securityOpen} onOpenChange={setSecurityOpen}>
        <DialogContent className={cn("sm:max-w-md border", isDark ? "bg-slate-900 border-white/10 text-white" : "bg-white border-gray-200 text-gray-900")}>
          <div className="flex flex-col items-center pt-2">
            <div className={cn("p-4 rounded-full mb-4 animate-in zoom-in duration-300", isDark ? "bg-emerald-500/10" : "bg-emerald-50")}>
              <Shield className="h-10 w-10 text-emerald-500" />
            </div>
            <DialogHeader className="text-center sm:text-center">
              <DialogTitle className="text-xl font-bold">{strings.security.title}</DialogTitle>
              <DialogDescription className={cn("text-center mt-2", isDark ? "text-zinc-400" : "text-gray-500")}>
                Important information about how DockForLife protects your data
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-6 py-4">
            <div className="flex items-start gap-4">
              <div className={cn("p-2 rounded-lg shrink-0", isDark ? "bg-blue-500/10" : "bg-blue-50")}>
                <HardDrive className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <h4 className="font-semibold text-sm mb-1">{strings.security.localData}</h4>
                <p className={cn("text-xs leading-relaxed", isDark ? "text-zinc-400" : "text-gray-600")}>
                  {strings.security.localDataDesc}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className={cn("p-2 rounded-lg shrink-0", isDark ? "bg-emerald-500/10" : "bg-emerald-50")}>
                <Lock className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <h4 className="font-semibold text-sm mb-1">{strings.security.noDataCollection}</h4>
                <p className={cn("text-xs leading-relaxed", isDark ? "text-zinc-400" : "text-gray-600")}>
                  {strings.security.noDataCollectionDesc}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className={cn("p-2 rounded-lg shrink-0", isDark ? "bg-purple-500/10" : "bg-purple-50")}>
                <Wifi className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <h4 className="font-semibold text-sm mb-1">{strings.security.directConnection}</h4>
                <p className={cn("text-xs leading-relaxed", isDark ? "text-zinc-400" : "text-gray-600")}>
                  {strings.security.directConnectionDesc}
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setSecurityOpen(false)} className="w-full bg-blue-600 hover:bg-blue-700 text-white border-0">
              {strings.security.ok}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Help Dialog */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className={cn("sm:max-w-md border", isDark ? "bg-slate-900 border-white/10 text-white" : "bg-white border-gray-200 text-gray-900")}>
          <DialogHeader>
            <div className="flex items-center justify-center mb-4">
              <div className={cn("p-3 rounded-full", isDark ? "bg-blue-500/20" : "bg-blue-100")}>
                <HelpCircle className="h-8 w-8 text-blue-500" />
              </div>
            </div>
            <DialogTitle className="text-center text-xl">{strings.help.title}</DialogTitle>
            <DialogDescription className={cn("text-center text-sm", isDark ? "text-zinc-400" : "text-gray-500")}>
              {strings.help.subtitle}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            {/* Web/Desktop Mode */}
            <div className={cn("p-4 rounded-xl border", isDark ? "bg-zinc-900/50 border-white/10" : "bg-gray-50 border-gray-200")}>
              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <Monitor className="h-4 w-4 text-blue-500" />
                {strings.help.desktopTitle}
              </h4>
              <ul className={cn("text-xs space-y-2", isDark ? "text-zinc-400" : "text-gray-600")}>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 font-bold">1.</span>
                  {strings.help.desktopDesc1}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 font-bold">2.</span>
                  {strings.help.desktopDesc2}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 font-bold">3.</span>
                  {strings.help.desktopDesc3}
                </li>
              </ul>
            </div>

            {/* Mobile / Remote Mode */}
            <div className={cn("p-4 rounded-xl border", isDark ? "bg-zinc-900/50 border-white/10" : "bg-gray-50 border-gray-200")}>
              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <Wifi className="h-4 w-4 text-green-500" />
                {strings.help.remoteTitle}
              </h4>
              <ul className={cn("text-xs space-y-2", isDark ? "text-zinc-400" : "text-gray-600")}>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 font-bold">1.</span>
                  {strings.help.remoteDesc1}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 font-bold">2.</span>
                  {strings.help.remoteDesc2}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 font-bold">3.</span>
                  {strings.help.remoteDesc3}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 font-bold">4.</span>
                  {strings.help.remoteDesc4}
                </li>
              </ul>
            </div>

            {/* Tips */}
            <div className={cn("p-4 rounded-xl border", isDark ? "bg-amber-500/10 border-amber-500/20" : "bg-amber-50 border-amber-200")}>
              <h4 className="font-semibold text-sm mb-2 text-amber-500">💡 {strings.help.tipsTitle}</h4>
              <ul className={cn("text-xs space-y-1", isDark ? "text-zinc-400" : "text-gray-600")}>
                <li>• {strings.help.tip1}</li>
                <li>• {strings.help.tip2}</li>
                <li>• {strings.help.tip3}</li>
                <li>• {strings.help.tip4}</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setHelpOpen(false)} className="w-full">{strings.help.gotIt}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Onboarding Dialog */}
      <Dialog open={onboardingOpen} onOpenChange={setOnboardingOpen}>
        <DialogContent className={cn("sm:max-w-md border", isDark ? "bg-slate-900 border-white/10 text-white" : "bg-white border-gray-200 text-gray-900")}>
          <DialogHeader>
            <div className="flex items-center justify-center mb-4"><Logo className={cn("h-16 w-16", isDark ? "text-white" : "text-gray-900")} /></div>
            <DialogTitle className="text-center text-xl">Welcome to DOCK<span className="text-blue-500">FORLIFE</span></DialogTitle>
            <DialogDescription className={cn("text-center text-sm", isDark ? "text-zinc-400" : "text-gray-500")}>Control OBS from any device on your local network</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Requirements:</h4>
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  {connected ? <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" /> : <XCircle className={cn("h-5 w-5 shrink-0 mt-0.5", isDark ? "text-zinc-600" : "text-gray-400")} />}
                  <div><p className="text-sm font-medium">OBS Studio running</p><p className={cn("text-xs", isDark ? "text-zinc-500" : "text-gray-500")}>Make sure OBS is open and running</p></div>
                </div>
                <div className="flex items-start gap-3">
                  {connected ? <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" /> : <XCircle className={cn("h-5 w-5 shrink-0 mt-0.5", isDark ? "text-zinc-600" : "text-gray-400")} />}
                  <div><p className="text-sm font-medium">WebSocket Server enabled</p><p className={cn("text-xs", isDark ? "text-zinc-500" : "text-gray-500")}>In OBS: Tools &gt; WebSocket Server Settings</p></div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                  <div><p className="text-sm font-medium">Port 4455 (default)</p><p className={cn("text-xs", isDark ? "text-zinc-500" : "text-gray-500")}>You can change this in settings</p></div>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button onClick={() => { setOnboardingOpen(false); setSettingsOpen(true) }} className="w-full">Configure Connection</Button>
            <Button variant="ghost" onClick={() => setOnboardingOpen(false)} className="w-full">Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className={cn("sm:max-w-md border", isDark ? "bg-slate-900 border-white/10 text-white" : "bg-white border-gray-200 text-gray-900")}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className={cn("p-2 rounded-xl", isDark ? "bg-blue-500/20" : "bg-blue-100")}><Wifi className="h-5 w-5 text-blue-500" /></div>
              {isClientMode ? strings.agent.title : strings.settings.title}
            </DialogTitle>
            <DialogDescription className={cn("text-sm", isDark ? "text-zinc-400" : "text-gray-500")}>{isClientMode ? strings.agent.desc : strings.settings.remoteModeDesc}</DialogDescription>
          </DialogHeader>

          {isClientMode ? (
            <div className="space-y-6 py-4">
              {isClient && storedPairingCode && (
                <div className={cn("p-4 rounded-xl text-center border", isDark ? "bg-blue-500/10 border-blue-500/20" : "bg-blue-50 border-blue-200")}>
                  <p className={cn("text-xs mb-1", isDark ? "text-blue-400" : "text-blue-600")}>{strings.settings.linkedCode}</p>
                  <p className="text-xl font-mono font-bold tracking-widest">{storedPairingCode}</p>
                  <Button variant="ghost" size="sm" onClick={() => setClearConnectionDialogOpen(true)} className={cn("mt-2 text-xs", isDark ? "text-zinc-400 hover:text-white" : "text-gray-500 hover:text-gray-900")}>
                    {strings.settings.clearConnection}
                  </Button>
                </div>
              )}
              <div className="space-y-4">
                <Label htmlFor="client-join-code" className="text-center block text-lg font-medium">{strings.settings.joinCode}</Label>
                <Input id="client-join-code" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder={strings.settings.joinCodePlaceholder} maxLength={12} className={cn("text-center text-xl font-mono tracking-widest py-6 rounded-xl", isDark ? "bg-zinc-900 border-white/10" : "bg-gray-50 border-gray-200")} />
              </div>
              <Button size="lg" className="w-full py-6 text-lg rounded-xl" disabled={joinCode.length < 4 || isConnecting} onClick={() => { if (connected && obsRef.current) { try { obsRef.current.disconnect() } catch {} obsRef.current = null; setConnected(false) } setIsRemoteMode(true); connectToWorker() }}>{isConnecting ? strings.settings.connecting : strings.settings.button}</Button>
              {remoteWaitingForAgent && <div className={cn("p-4 rounded-xl text-center", isDark ? "bg-amber-500/10" : "bg-amber-50")}><p className={cn("text-sm", isDark ? "text-amber-400" : "text-amber-700")}>{strings.toasts.agentNotRunning}</p></div>}
              {connected && <div className={cn("p-4 rounded-xl text-center", isDark ? "bg-green-500/10" : "bg-green-50")}><p className={cn("text-sm font-medium", isDark ? "text-green-400" : "text-green-700")}>{strings.toasts.connected}</p></div>}
            </div>
          ) : (
            <div className="space-y-4">
              <div className={cn("space-y-2", isRemoteMode && "opacity-50")}>
                <Label htmlFor="ws-url">{strings.settings.wsUrl}</Label>
                <Input id="ws-url" value={wsUrl} onChange={(e) => setWsUrl(e.target.value)} placeholder={strings.settings.wsUrlPlaceholder} disabled={isRemoteMode} className={cn("rounded-xl", isDark ? "bg-zinc-900 border-white/10" : "bg-gray-50 border-gray-200")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="join-code">{strings.settings.joinCode}</Label>
                <Input id="join-code" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder={strings.settings.joinCodePlaceholder} maxLength={12} className={cn("font-mono tracking-widest uppercase rounded-xl", isDark ? "bg-zinc-900 border-white/10" : "bg-gray-50 border-gray-200")} />
              </div>
              <div className="flex gap-2">
                <Button className="flex-1 rounded-xl" onClick={() => { disconnectWorker(); setIsRemoteMode(false); connectOBS() }} disabled={isConnecting && !isRemoteMode}>{isConnecting && !isRemoteMode ? strings.settings.connecting : strings.settings.local}</Button>
                <Button variant={isRemoteMode ? "default" : "outline"} className="flex-1 rounded-xl" onClick={() => { disconnectWorker(); setIsRemoteMode(true); connectToWorker() }} disabled={isConnecting && isRemoteMode}>{isConnecting && isRemoteMode ? strings.settings.connecting : strings.settings.remote}</Button>
              </div>

{/* Local Agent Download Section - Redesigned Cards */}
              <div className={cn("pt-4 border-t", isDark ? "border-white/10" : "border-gray-200")}>
                <Label className="flex items-center gap-2 text-sm font-medium mb-3">
                  <Download className="h-4 w-4" />
                  {strings.settings.download}
                </Label>
                <div className="grid grid-cols-3 gap-3">
                  {/* Windows Card */}
                  <button
                    onClick={() => handleDownloadClick("windows")}
                    className={cn(
                      "relative group flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-300",
                      userOS === "windows"
                        ? isDark 
                          ? "bg-blue-500/20 border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.3)]" 
                          : "bg-blue-50 border-blue-300 shadow-[0_0_20px_rgba(59,130,246,0.2)]"
                        : isDark 
                          ? "bg-zinc-800/50 border-white/10 hover:bg-zinc-800 hover:border-white/20" 
                          : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                    )}
                  >
                    <Monitor className={cn("h-8 w-8", userOS === "windows" ? "text-blue-500" : "text-zinc-400 group-hover:text-zinc-300")} />
                    <span className={cn("text-xs font-medium", isDark ? "text-white" : "text-gray-900")}>{strings.settings.downloadCard.windows}</span>
                    {userOS === "windows" && (
                      <span className={cn("absolute -top-2 -right-2 text-[10px] px-2 py-0.5 rounded-full bg-blue-500 text-white font-medium")}>
                        {strings.settings.recommended}
                      </span>
                    )}
                  </button>

                  {/* macOS Card */}
                  <button
                    onClick={() => handleDownloadClick("macos")}
                    className={cn(
                      "relative group flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-300",
                      userOS === "macos"
                        ? isDark 
                          ? "bg-blue-500/20 border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.3)]" 
                          : "bg-blue-50 border-blue-300 shadow-[0_0_20px_rgba(59,130,246,0.2)]"
                        : isDark 
                          ? "bg-zinc-800/50 border-white/10 hover:bg-zinc-800 hover:border-white/20" 
                          : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                    )}
                  >
                    <Apple className={cn("h-8 w-8", userOS === "macos" ? "text-blue-500" : "text-zinc-400 group-hover:text-zinc-300")} />
                    <span className={cn("text-xs font-medium", isDark ? "text-white" : "text-gray-900")}>{strings.settings.downloadCard.macos}</span>
                    {userOS === "macos" && (
                      <span className={cn("absolute -top-2 -right-2 text-[10px] px-2 py-0.5 rounded-full bg-blue-500 text-white font-medium")}>
                        {strings.settings.recommended}
                      </span>
                    )}
                  </button>

                  {/* Linux Card */}
                  <button
                    onClick={() => handleDownloadClick("linux")}
                    className={cn(
                      "relative group flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-300",
                      userOS === "linux"
                        ? isDark 
                          ? "bg-blue-500/20 border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.3)]" 
                          : "bg-blue-50 border-blue-300 shadow-[0_0_20px_rgba(59,130,246,0.2)]"
                        : isDark 
                          ? "bg-zinc-800/50 border-white/10 hover:bg-zinc-800 hover:border-white/20" 
                          : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                    )}
                  >
                    <Terminal className={cn("h-8 w-8", userOS === "linux" ? "text-blue-500" : "text-zinc-400 group-hover:text-zinc-300")} />
                    <span className={cn("text-xs font-medium", isDark ? "text-white" : "text-gray-900")}>{strings.settings.downloadCard.linux}</span>
                    {userOS === "linux" && (
                      <span className={cn("absolute -top-2 -right-2 text-[10px] px-2 py-0.5 rounded-full bg-blue-500 text-white font-medium")}>
                        {strings.settings.recommended}
                      </span>
                    )}
                  </button>
                </div>
                <p className={cn("text-[10px] mt-3 text-center", isDark ? "text-zinc-500" : "text-gray-400")}>
                  {RELEASE_VERSION} • ~7MB • {strings.agent.note}
                </p>
              </div>

              {/* Clear Connection */}
              {storedPairingCode && (
                <div className={cn("pt-4 border-t", isDark ? "border-white/10" : "border-gray-200")}>
                  <button
                    onClick={() => setClearConnectionDialogOpen(true)}
                    className={cn(
                      "w-full flex items-center justify-between gap-3 p-3 rounded-xl border transition-all",
                      isDark 
                        ? "bg-red-500/10 border-red-500/20 hover:bg-red-500/20" 
                        : "bg-red-50 border-red-200 hover:bg-red-100"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("p-2 rounded-lg", isDark ? "bg-red-500/20" : "bg-red-100")}>
                        <Trash2 className={cn("h-4 w-4", isDark ? "text-red-400" : "text-red-600")} />
                      </div>
                      <span className={cn("text-sm font-medium", isDark ? "text-red-400" : "text-red-600")}>
                        {strings.settings.clearConnection}
                      </span>
                    </div>
                    <RefreshCw className={cn("h-4 w-4", isDark ? "text-zinc-500" : "text-gray-400")} />
                  </button>
                </div>
              )}

              {/* Language Switcher */}
              <div className={cn("pt-4 border-t", isDark ? "border-white/10" : "border-gray-200")}>
                <Label className="flex items-center gap-2 text-sm font-medium mb-3">
                  <Globe className="h-4 w-4" />
                  {strings.settings.language}
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => changeLanguage("en")}
                    className={cn(
                      "flex items-center justify-center gap-2 p-3 rounded-xl border transition-all",
                      lang === "en"
                        ? isDark
                          ? "bg-blue-500/20 border-blue-500/50"
                          : "bg-blue-50 border-blue-300"
                        : isDark
                          ? "bg-zinc-800/50 border-white/10 hover:bg-zinc-800"
                          : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                    )}
                  >
                    <span className={cn("text-sm font-medium", lang === "en" ? "text-blue-400" : isDark ? "text-zinc-400" : "text-gray-600")}>
                      {strings.settings.languageEn}
                    </span>
                  </button>
                  <button
                    onClick={() => changeLanguage("es")}
                    className={cn(
                      "flex items-center justify-center gap-2 p-3 rounded-xl border transition-all",
                      lang === "es"
                        ? isDark
                          ? "bg-blue-500/20 border-blue-500/50"
                          : "bg-blue-50 border-blue-300"
                        : isDark
                          ? "bg-zinc-800/50 border-white/10 hover:bg-zinc-800"
                          : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                    )}
                  >
                    <span className={cn("text-sm font-medium", lang === "es" ? "text-blue-400" : isDark ? "text-zinc-400" : "text-gray-600")}>
                      {strings.settings.languageEs}
                    </span>
                  </button>
                </div>
              </div>

              {/* Factory Reset */}
              <div className={cn("pt-4 border-t", isDark ? "border-white/10" : "border-gray-200")}>
                <Label className="flex items-center gap-2 text-sm font-medium mb-3 text-red-500">
                  <RefreshCw className="h-4 w-4" />
                  Danger Zone
                </Label>
                <button
                  onClick={() => {
                    if (confirm("⚠️ WARNING: This will delete ALL your settings, buttons, and connection data.\n\nThis action cannot be undone.\n\nAre you sure you want to continue?")) {
                      handleFactoryReset()
                    }
                  }}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 p-3 rounded-xl border transition-all",
                    isDark
                      ? "bg-red-500/10 border-red-500/30 hover:bg-red-500/20 text-red-400"
                      : "bg-red-50 border-red-200 hover:bg-red-100 text-red-600"
                  )}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="text-sm font-medium">Factory Reset</span>
                </button>
                <p className={cn("text-[10px] mt-2 text-center", isDark ? "text-zinc-500" : "text-gray-400")}>
                  Clears all saved data and resets to defaults
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Clear Connection Confirmation Dialog */}
      <Dialog open={clearConnectionDialogOpen} onOpenChange={setClearConnectionDialogOpen}>
        <DialogContent className={cn("sm:max-w-md border", isDark ? "bg-slate-900 border-white/10 text-white" : "bg-white border-gray-200 text-gray-900")}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-500">
              <Trash2 className="h-5 w-5" />
              {strings.settings.clearConnection}
            </DialogTitle>
            <DialogDescription className={cn("text-sm", isDark ? "text-zinc-400" : "text-gray-500")}>
              {strings.settings.clearConnectionConfirm}
            </DialogDescription>
          </DialogHeader>
          {storedPairingCode && (
            <div className={cn("p-4 rounded-xl mt-2", isDark ? "bg-zinc-800/50" : "bg-gray-100")}>
              <p className={cn("text-xs mb-2", isDark ? "text-zinc-500" : "text-gray-500")}>{strings.settings.linkedCode}</p>
              <div className="flex items-center justify-center gap-2">
                <code className={cn("text-lg font-mono font-bold tracking-widest px-4 py-2 rounded-lg", isDark ? "bg-zinc-900 text-blue-400" : "bg-white text-blue-600 border")}>
                  {storedPairingCode}
                </code>
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setClearConnectionDialogOpen(false)} className="flex-1">
              {strings.dialogs.cancel}
            </Button>
            <Button variant="destructive" onClick={confirmClearConnection} className="flex-1 bg-red-600 hover:bg-red-700">
              {strings.settings.clearConnection}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Download Instructions Dialog */}
      <Dialog open={downloadDialogOpen} onOpenChange={setDownloadDialogOpen}>
        <DialogContent className={cn("sm:max-w-md border", isDark ? "bg-slate-900 border-white/10 text-white" : "bg-white border-gray-200 text-gray-900")}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5 text-blue-500" />
              {downloadInstructions[selectedOS].title} Setup
            </DialogTitle>
            <DialogDescription className={cn("text-sm", isDark ? "text-zinc-400" : "text-gray-500")}>
              Follow these steps to run the DockForLife agent on your computer
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className={cn("rounded-xl p-4", isDark ? "bg-zinc-800/50" : "bg-gray-100")}>
              <ol className={cn("space-y-3 text-sm", isDark ? "text-zinc-300" : "text-gray-700")}>
                {downloadInstructions[selectedOS].steps.map((step, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <span className={cn("flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold", isDark ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-600")}>
                      {index + 1}
                    </span>
                    <span className="flex-1">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className={cn("p-3 rounded-lg text-xs", isDark ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-emerald-50 text-emerald-700 border border-emerald-200")}>
              <p className="font-medium">Pro tip:</p>
              <p>{selectedOS === "linux" || selectedOS === "macos" ? "Run the agent in the background with: nohup ./dockforlife-linux &" : "The agent runs silently in the background. Check system tray if needed."}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDownloadDialogOpen(false)}>Cancel</Button>
            <Button onClick={proceedDownload} className="bg-blue-600 hover:bg-blue-700">
              Download Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Button Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className={cn("sm:max-w-sm border", isDark ? "bg-slate-900 border-white/10 text-white" : "bg-white border-gray-200 text-gray-900")}>
          <DialogHeader>
            <DialogTitle>{currentIdx !== null ? strings.dialogs.editTitle : strings.dialogs.addTitle}</DialogTitle>
            <DialogDescription className={cn("text-sm", isDark ? "text-zinc-400" : "text-gray-500")}>{currentIdx !== null ? "Edit button properties" : "Create a new button"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-4">
            <div className="space-y-2">
              <Label htmlFor="label">{strings.dialogs.label}</Label>
              <Input id="label" value={formData.label} onChange={(e) => setFormData({ ...formData, label: e.target.value })} placeholder={strings.dialogs.buttonName} className={cn("rounded-md h-12", isDark ? "bg-zinc-900 border-white/10" : "bg-gray-50 border-gray-200")} />
            </div>
            
            <div className="space-y-2">
              <Label>{strings.dialogs.action}</Label>
              <Select value={formData.type} onValueChange={(value: ButtonType) => { setFormData({ ...formData, type: value, target: "", filter: "" }); setFilters([]) }}>
                <SelectTrigger className={cn("rounded-md h-12", isDark ? "bg-zinc-900 border-white/10" : "bg-gray-50 border-gray-200")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Mute">Mute Audio</SelectItem>
                  <SelectItem value="Visibility">Toggle Visibility</SelectItem>
                  <SelectItem value="Filter">Toggle Filter</SelectItem>
                  <SelectItem value="Scene">Change Scene</SelectItem>
                  <SelectItem value="Record">Record</SelectItem>
                  <SelectItem value="Stream">Stream</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {needsTarget && (
              <div className="space-y-2">
                <Label>{strings.dialogs.target}</Label>
                <Select value={formData.target || ""} onValueChange={(value) => { setFormData({ ...formData, target: value, filter: "" }); if (formData.type === "Filter") loadFilters(value) }}>
                  <SelectTrigger className={cn("rounded-md h-12", isDark ? "bg-zinc-900 border-white/10" : "bg-gray-50 border-gray-200")}><SelectValue placeholder={strings.dialogs.selectTarget} /></SelectTrigger>
                  <SelectContent>{getTargetList.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            
            {formData.type === "Filter" && (
              <div className="space-y-2">
                <Label>{strings.dialogs.filter}</Label>
                <Select value={formData.filter || ""} onValueChange={(value) => setFormData({ ...formData, filter: value })}>
                  <SelectTrigger className={cn("rounded-md h-12", isDark ? "bg-zinc-900 border-white/10" : "bg-gray-50 border-gray-200")}><SelectValue placeholder={strings.dialogs.selectFilter} /></SelectTrigger>
                  <SelectContent>{(filters || []).map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            
            <div className="space-y-5">
              {/* Idle Color */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: formData.color }} />
                  {strings.dialogs.idleColor}
                </Label>
                <div className="grid grid-cols-5 gap-3">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c.value}
                      className={cn(
                        "w-full aspect-square rounded-full transition-all duration-200",
                        formData.color === c.value
                          ? "ring-2 ring-blue-500 ring-offset-2 scale-110"
                          : "hover:scale-105",
                        isDark ? "ring-offset-slate-900" : "ring-offset-white"
                      )}
                      style={{ backgroundColor: c.value }}
                      onClick={() => setFormData({ ...formData, color: c.value })}
                      aria-label={`Select ${c.label} color`}
                    />
                  ))}
                </div>
                <div className="relative">
                  <div className={cn("flex items-center gap-3 p-3 rounded-md border", isDark ? "bg-zinc-900/50 border-white/10" : "bg-gray-50 border-gray-200")}>
                    <div className="relative">
                      <Palette className="h-5 w-5 text-zinc-500 absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <Input 
                        type="color" 
                        value={formData.color} 
                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                        className="w-8 h-8 p-0 border-0 opacity-0 cursor-pointer absolute inset-0"
                      />
                      <div className="w-5 h-5 ml-8 rounded-full border border-white/20" style={{ backgroundColor: formData.color }} />
                    </div>
                    <span className="text-sm text-zinc-500">{strings.dialogs.customColor}</span>
                  </div>
                </div>
              </div>

              {/* Active Color */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: formData.colorActive || "#3b82f6" }} />
                  {strings.dialogs.activeColor}
                </Label>
                <div className="grid grid-cols-5 gap-3">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={`active-${c.value}`}
                      className={cn(
                        "w-full aspect-square rounded-full transition-all duration-200",
                        formData.colorActive === c.active
                          ? "ring-2 ring-blue-500 ring-offset-2 scale-110"
                          : "hover:scale-105",
                        isDark ? "ring-offset-slate-900" : "ring-offset-white"
                      )}
                      style={{ backgroundColor: c.active }}
                      onClick={() => setFormData({ ...formData, colorActive: c.active })}
                      aria-label={`Select ${c.label} active color`}
                    />
                  ))}
                </div>
                <div className="relative">
                  <div className={cn("flex items-center gap-3 p-3 rounded-md border", isDark ? "bg-zinc-900/50 border-white/10" : "bg-gray-50 border-gray-200")}>
                    <div className="relative">
                      <Palette className="h-5 w-5 text-zinc-500 absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <Input 
                        type="color" 
                        value={formData.colorActive || "#3b82f6"} 
                        onChange={(e) => setFormData({ ...formData, colorActive: e.target.value })}
                        className="w-8 h-8 p-0 border-0 opacity-0 cursor-pointer absolute inset-0"
                      />
                      <div className="w-5 h-5 ml-8 rounded-full border border-white/20" style={{ backgroundColor: formData.colorActive || "#3b82f6" }} />
                    </div>
                    <span className="text-sm text-zinc-500">{strings.dialogs.customColor}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="flex gap-2 sm:flex-row">
            {currentIdx !== null && <Button variant="destructive" className="flex-1 rounded-xl" onClick={() => setDeleteDialogOpen(true)}>{strings.dialogs.delete}</Button>}
            <Button className="flex-1 rounded-xl" onClick={saveButton}>{strings.dialogs.save}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className={cn("sm:max-w-sm border", isDark ? "bg-slate-900 border-white/10 text-white" : "bg-white border-gray-200 text-gray-900")}>
          <AlertDialogHeader>
            <AlertDialogTitle>{strings.dialogs.deleteTitle}</AlertDialogTitle>
            <AlertDialogDesc className={cn("text-sm", isDark ? "text-zinc-400" : "text-gray-500")}>{strings.dialogs.deleteDesc}</AlertDialogDesc>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2 sm:flex-row">
            <AlertDialogCancel className={cn("flex-1 rounded-xl", isDark ? "" : "bg-gray-100 text-gray-900 hover:bg-gray-200")}>{strings.dialogs.cancel}</AlertDialogCancel>
            <AlertDialogAction className="flex-1 bg-red-600 hover:bg-red-700 rounded-xl" onClick={deleteButton}>{strings.dialogs.delete}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Toast notification */}
      {toast && <div className={cn("fixed bottom-24 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-full shadow-xl z-50", toast.type === "success" ? "bg-green-500 text-white" : "bg-red-500 text-white")}>{toast.message}</div>}
    </div>
  )
}
