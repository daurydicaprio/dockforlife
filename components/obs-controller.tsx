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

interface OBSData {
  scenes: { sceneName: string }[]
  inputs: { inputName: string }[]
  allSources: string[]
  rec: boolean
  str: boolean
}

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

const DEFAULT_DECK: DeckButton[] = [
  { id: generateId(), label: "MIC", type: "Mute", target: "Mic/Aux", color: "#18181b", colorActive: "#3b82f6" },
  { id: generateId(), label: "DESKTOP", type: "Mute", target: "Desktop Audio", color: "#18181b", colorActive: "#3b82f6" },
  { id: generateId(), label: "REC", type: "Record", color: "#18181b", colorActive: "#ef4444" },
  { id: generateId(), label: "STREAM", type: "Stream", color: "#18181b", colorActive: "#22c55e" },
]

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

export function OBSController() {
  const obsRef = useRef<OBSWebSocket | null>(null)
  const workerRef = useRef<WebSocket | null>(null)
  const [deck, setDeck] = useState<DeckButton[]>([])
  const [connected, setConnected] = useState(false)
  const [lang, setLang] = useState<Language>("en")
  const [strings, setStrings] = useState<LocaleStrings>(getLocaleStrings("en"))
  const [obsData, setObsData] = useState<OBSData>({
    scenes: [],
    inputs: [],
    allSources: [],
    rec: false,
    str: false,
  })
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
  const [joinCode, setJoinCode] = useState("")
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [muteStates, setMuteStates] = useState<Record<string, boolean>>({})
  const [isDark, setIsDark] = useState(true)
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [adapter, setAdapter] = useState<OBSWebSocketAdapter | null>(null)
  const [userOS, setUserOS] = useState<"windows" | "macos" | "linux" | "other">("other")
  const [isRemoteMode, setIsRemoteMode] = useState(false)
  const [isRemoteConnected, setIsRemoteConnected] = useState(false)
  const [connectionMode, setConnectionMode] = useState<"local" | "remote" | "none" | "dual" | "bridge">("none")
  const [isMobile, setIsMobile] = useState(false)
  const [isClientMode, setIsClientMode] = useState(false)
  const [remoteWaitingForAgent, setRemoteWaitingForAgent] = useState(false)
  const [remoteConnectionFailed, setRemoteConnectionFailed] = useState(false)
  const [hasOBSData, setHasOBSData] = useState(false)
  const [obsDataError, setObsDataError] = useState<string | null>(null)
  const remoteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isRemoteModeRef = useRef(false)
  const connectionModeRef = useRef<"local" | "remote" | "none" | "dual" | "bridge">("none")
  


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
          } else if (data.type === "obs-data" || data.type === "obs_data") {
            console.log("OBS DATA RECEIVED:", JSON.stringify(data, null, 2))
            
            const obsPayload = data.data
            if (!obsPayload || typeof obsPayload !== "object") {
              console.log("Waiting for OBS data...")
              return
            }
            
            setObsDataError(null)
            const scenes = Array.isArray(obsPayload.scenes) ? obsPayload.scenes : []
            const inputs = Array.isArray(obsPayload.inputs) ? obsPayload.inputs : []
            const currentScene = obsPayload.currentScene || ""
            
            setObsData((prev) => ({ 
              ...prev, 
              scenes, 
              inputs, 
              allSources: [...scenes.map((s: { sceneName: string }) => s.sceneName), ...inputs.map((i: { inputName: string }) => i.inputName)]
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
            setObsData((prev) => ({ ...prev, rec: data.rec, str: data.str }))
            if (data.muteStates && typeof data.muteStates === "object") {
              const newMuteStates: Record<string, boolean> = {}
              for (const [key, value] of Object.entries(data.muteStates)) {
                if (typeof value === "boolean") newMuteStates[key] = value
              }
              setMuteStates(newMuteStates)
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

      setObsData({
        scenes: sceneList.scenes as { sceneName: string }[],
        inputs: inputList.inputs as { inputName: string }[],
        allSources: Array.from(sourceSet).sort(),
        rec: false,
        str: false,
      })

      const obsAdapter = new OBSWebSocketAdapter(obs)
      setAdapter(obsAdapter)

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

          const [recStatus, streamStatus] = await Promise.all([obs.call("GetRecordStatus"), obs.call("GetStreamStatus")])

          setObsData((prev) => ({ ...prev, rec: recStatus.outputActive, str: streamStatus.outputActive }))

          const newMuteStates: Record<string, boolean> = {}
          for (const btn of deck) {
            if (btn.type === "Mute" && btn.target) {
              try {
                const { inputMuted } = await obs.call("GetInputMute", { inputName: btn.target })
                newMuteStates[btn.target] = inputMuted
              } catch {}
            }
          }
          setMuteStates(newMuteStates)
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
          setMuteStates((prev) => ({ ...prev, [targetName]: !Boolean(prev[targetName]) }))
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
  
  const handleButtonClick = (btn: DeckButton, index: number) => {
    // Prevent click if we were dragging
    if (isDraggingRef.current) {
      isDraggingRef.current = false
      return
    }
    execute(btn)
  }

  const getTargetList = useMemo(() => {
    switch (formData.type) {
      case "Scene": return (obsData?.scenes || []).map((s) => s.sceneName)
      case "Mute": return (obsData?.inputs || []).map((i) => i.inputName)
      default: return obsData?.allSources || []
    }
  }, [formData.type, obsData])

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
                // Check active state for each button type
                const isRecording = btn.type === "Record" && (obsData?.rec || false)
                const isStreaming = btn.type === "Stream" && (obsData?.str || false)
                const isMuted = Boolean(btn.type === "Mute" && btn.target && (muteStates || {})[btn.target])
                
                // Button is active if it's in its active state (recording, streaming, or muted for mute buttons)
                const isActive = isRecording || isStreaming || (btn.type === "Mute" && isMuted)
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
                        "border"
                      )}
                      style={{ 
                        backgroundColor: bgColor,
                        color: textColor,
                        borderColor: isActive || isMuted ? "transparent" : (isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)")
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
                  "min-h-[160px] sm:min-h-[180px] rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-4 transition-colors",
                  isDark 
                    ? "border-white/20 text-zinc-500 hover:border-white/40 hover:text-zinc-300 bg-zinc-900/40" 
                    : "border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-600 bg-gray-100/50"
                )}
                onClick={() => openModal(deck.length)}
                aria-label="Add new button"
              >
                <Plus className="h-10 w-10" />
                <span className="text-sm font-bold uppercase tracking-wider text-center px-3 leading-tight opacity-0">ADD</span>
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
              Hecho con <span className="text-pink-500">♥</span> por <span className={cn("font-medium", isDark ? "text-zinc-300" : "text-gray-700")}>Daury DiCaprio</span>
            </p>
            <p className={cn("text-[10px] mt-0.5", isDark ? "text-zinc-600" : "text-gray-400")}>#verygoodforlife</p>
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

              {/* Local Agent Download Section */}
              <div className={cn("pt-4 border-t", isDark ? "border-white/10" : "border-gray-200")}>
                <Label className="flex items-center gap-2">
                  <Monitor className="h-4 w-4" />
                  Download Local Agent
                </Label>
                <p className={cn("text-xs mt-1 mb-3", isDark ? "text-zinc-500" : "text-gray-500")}>
                  Download and run the agent on your computer to enable remote control from your phone
                </p>
                <div className="space-y-2">
                  <p className={cn("text-xs", isDark ? "text-zinc-400" : "text-gray-600")}>
                    {userOS === "windows" ? "Recommended for your system:" : userOS === "macos" ? "Recommended for your system:" : userOS === "linux" ? "Recommended for your system:" : "Select your operating system:"}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      variant={userOS === "windows" ? "default" : "outline"}
                      size="sm"
                      className="flex-1 text-xs rounded-lg"
                      onClick={() => window.open(`${getGitHubReleaseUrl()}/download/latest/dockforlife-agent-windows-amd64.exe`, "_blank")}
                    >
                      <div className="flex items-center gap-1">
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>
                        Windows
                      </div>
                    </Button>
                    <Button
                      variant={userOS === "macos" ? "default" : "outline"}
                      size="sm"
                      className="flex-1 text-xs rounded-lg"
                      onClick={() => window.open(`${getGitHubReleaseUrl()}/download/latest/dockforlife-agent-macos-amd64`, "_blank")}
                    >
                      <div className="flex items-center gap-1">
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.21-1.96 1.07-3.11-1.05.05-2.31.71-3.06 1.58-.68.78-1.26 2.02-1.1 3.13 1.17.09 2.37-.72 3.09-1.58z"/></svg>
                        macOS
                      </div>
                    </Button>
                    <Button
                      variant={userOS === "linux" ? "default" : "outline"}
                      size="sm"
                      className="flex-1 text-xs rounded-lg"
                      onClick={() => window.open(`${getGitHubReleaseUrl()}/download/latest/dockforlife-agent-linux-amd64`, "_blank")}
                    >
                      <div className="flex items-center gap-1">
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12.504 0c-.155 0-.315.008-.48.021-1.22.087-2.405.534-3.373 1.19-.989.67-1.75 1.586-2.196 2.646-.448 1.06-.58 2.233-.375 3.364.205 1.13.735 2.18 1.524 3.024.788.844 1.794 1.44 2.905 1.72 1.11.28 2.282.23 3.36-.14 1.077-.37 2.03-1.05 2.75-1.95.72-.9 1.18-1.99 1.32-3.12.14-1.13-.09-2.27-.68-3.27-.59-1-1.48-1.82-2.56-2.36-1.08-.54-2.32-.74-3.56-.58l-.18.02-.12.02-.12.01h-.12l-.12.01h-.12l-.12.01h-.12l-.12.01h-.12l-.12.01h-.12l-.12.01h-.12l-.12.01h-.12l-.12.01h-.12l-.12.01h-.12l-.12.01h-.12l-.12.01h-.12zM8.96 13.5c-1.55.01-3.08.4-4.45 1.13-1.37.73-2.54 1.8-3.4 3.11-.43.65-.75 1.36-.95 2.11-.2.75-.28 1.53-.24 2.3.04.77.22 1.52.53 2.23.31.71.74 1.36 1.28 1.92.54.56 1.18 1.02 1.89 1.36.71.34 1.48.55 2.27.62.79.07 1.58 0 2.35-.21.77-.21 1.49-.55 2.14-.99.65-.44 1.22-.98 1.68-1.6.46-.62.81-1.32 1.03-2.07.22-.75.31-1.54.26-2.32-.05-.78-.23-1.54-.54-2.25-.31-.71-.75-1.36-1.29-1.91-.54-.55-1.19-1-1.9-1.33-.71-.33-1.48-.54-2.28-.6-.8-.06-1.6.01-2.38.22-.78.21-1.51.56-2.17 1.01-.66.45-1.24 1-1.71 1.62-.47.62-.83 1.32-1.06 2.07-.23.75-.33 1.54-.29 2.32.04.78.22 1.55.53 2.27.31.72.76 1.38 1.31 1.94.55.56 1.21 1.02 1.93 1.36.72.34 1.5.55 2.3.61.8.06 1.61-.01 2.39-.22.78-.21 1.52-.56 2.19-1.02.67-.46 1.25-1.02 1.72-1.65.47-.63.83-1.34 1.05-2.09.22-.75.32-1.54.27-2.33-.05-.79-.24-1.56-.55-2.29"/></svg>
                        Linux
                      </div>
                    </Button>
                  </div>
                </div>
                <p className="text-[10px] text-zinc-600 mt-2">
                  GitHub Actions will build the agent automatically. Run it and use the code to connect from your phone.
                </p>
              </div>

              <div className="pt-4 border-t border-white/10">
                <Label>{strings.settings.language}</Label>
                <div className="flex gap-2 mt-2">
                  <Button variant={lang === "en" ? "default" : "outline"} className="flex-1 rounded-xl" onClick={() => { setLang("en"); setStrings(getLocaleStrings("en")); localStorage.setItem("dfl_lang", "en") }}>English</Button>
                  <Button variant={lang === "es" ? "default" : "outline"} className="flex-1 rounded-xl" onClick={() => { setLang("es"); setStrings(getLocaleStrings("es")); localStorage.setItem("dfl_lang", "es") }}>Español</Button>
                </div>
              </div>
            </div>
          )}
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
