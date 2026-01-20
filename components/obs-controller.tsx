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
import {
  CONTRACT_VERSION,
  CommandType,
  Command,
} from "@/lib/obs-contract"
import {
  validateCommand,
  createCommand,
  commandToString,
} from "@/lib/obs-validator"
import { OBSWebSocketAdapter } from "@/lib/obs-adapter"
import { getLocaleStrings, LocaleStrings, Language } from "@/lib/locales"
import { createConnectionManager, ConnectionManager, ConnectionState, ConnectionMode } from "@/lib/connection-manager"
import { Download, Monitor } from "lucide-react"
import { getWorkerUrl, generateJoinCode, getGitHubReleaseUrl, isValidJoinCode } from "@/lib/config"
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
  VolumeX,
  GripVertical,
  Moon,
  Sun,
  Heart,
  CheckCircle2,
  XCircle,
  Shield,
  HardDrive,
  Lock,
  Loader2,
} from "lucide-react"

type ButtonType = "Mute" | "Visibility" | "Filter" | "Scene" | "Record" | "Stream"

interface DeckButton {
  label: string
  type: ButtonType
  target?: string
  filter?: string
  color: string
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

const COLORS = [
  { value: "#18181b", label: "Dark" },
  { value: "#f4f4f5", label: "Light" },
  { value: "#22c55e", label: "Green" },
  { value: "#ef4444", label: "Red" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#eab308", label: "Yellow" },
  { value: "#8b5cf6", label: "Purple" },
  { value: "#ec4899", label: "Pink" },
]

const generateId = () => Math.random().toString(36).substring(2, 9)

const DEFAULT_DECK: DeckButton[] = [
  { id: generateId(), label: "MIC", type: "Mute", target: "Mic/Aux", color: "#18181b" },
  { id: generateId(), label: "DESKTOP", type: "Mute", target: "Desktop Audio", color: "#18181b" },
  { id: generateId(), label: "REC", type: "Record", color: "#ef4444" },
  { id: generateId(), label: "STREAM", type: "Stream", color: "#8b5cf6" },
]

function getContrastColor(hex: string, isDark: boolean): string {
  if (!hex) return isDark ? "#ffffff" : "#000000"
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? "#000000" : "#ffffff"
}

function getIcon(type: ButtonType) {
  const icons: Record<ButtonType, React.ReactNode> = {
    Mute: <Mic className="h-5 w-5 sm:h-6 sm:w-6" />,
    Visibility: <Eye className="h-5 w-5 sm:h-6 sm:w-6" />,
    Filter: <Video className="h-5 w-5 sm:h-6 sm:w-6" />,
    Scene: <Clapperboard className="h-5 w-5 sm:h-6 sm:w-6" />,
    Record: <Circle className="h-5 w-5 sm:h-6 sm:w-6" />,
    Stream: <Globe className="h-5 w-5 sm:h-6 sm:w-6" />,
  }
  return icons[type] || <Zap className="h-5 w-5 sm:h-6 sm:w-6" />
}

function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="currentColor" aria-hidden="true">
      <rect x="4" y="8" width="40" height="32" rx="4" strokeWidth="2" stroke="currentColor" fill="none" />
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
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [securityOpen, setSecurityOpen] = useState(false)
  const [currentIdx, setCurrentIdx] = useState<number | null>(null)
  const [formData, setFormData] = useState<DeckButton>({
    id: "",
    label: "",
    type: "Mute",
    target: "",
    filter: "",
    color: "#18181b",
  })
  const [filters, setFilters] = useState<string[]>([])
  const [wsUrl, setWsUrl] = useState("ws://127.0.0.1:4455")
  const [wsPassword, setWsPassword] = useState("")
  const [remoteUrl, setRemoteUrl] = useState("")
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
  const [autoJoinCode, setAutoJoinCode] = useState<string>("")
  const [isMobile, setIsMobile] = useState(false)
  const [isClientMode, setIsClientMode] = useState(false)
  const [remoteWaitingForAgent, setRemoteWaitingForAgent] = useState(false)
  const [remoteConnectionFailed, setRemoteConnectionFailed] = useState(false)
  const [hasOBSData, setHasOBSData] = useState(false)
  const remoteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isRemoteModeRef = useRef(false)
  const connectionModeRef = useRef<"local" | "remote" | "none" | "dual" | "bridge">("none")
  const obsDataRef = useRef(obsData)

  useEffect(() => {
    obsDataRef.current = obsData
  }, [obsData])

  useEffect(() => {
    isRemoteModeRef.current = isRemoteMode
  }, [isRemoteMode])

  useEffect(() => {
    connectionModeRef.current = connectionMode
  }, [connectionMode])

  useEffect(() => {
    const savedTheme = localStorage.getItem("dfl_theme")
    if (savedTheme) {
      setIsDark(savedTheme === "dark")
    }

    const saved = localStorage.getItem("dfl_deck_v2")
    if (saved) {
      setDeck(JSON.parse(saved))
    } else {
      setDeck(DEFAULT_DECK)
    }

    const savedUrl = localStorage.getItem("dfl_ws_url")
    const savedPass = localStorage.getItem("dfl_ws_pass")
    const savedRemoteUrl = localStorage.getItem("dfl_remote_url")
    const savedJoinCode = localStorage.getItem("dfl_join_code")
    const savedRemoteMode = localStorage.getItem("dfl_remote_mode")
    if (savedUrl) setWsUrl(savedUrl)
    if (savedPass) setWsPassword(savedPass)
    if (savedRemoteUrl) setRemoteUrl(savedRemoteUrl)
    if (savedJoinCode) setJoinCode(savedJoinCode)
    if (savedRemoteMode === "true") setIsRemoteMode(true)

    const savedLang = localStorage.getItem("dfl_lang") as Language | null
    if (savedLang && (savedLang === "en" || savedLang === "es")) {
      setLang(savedLang)
      setStrings(getLocaleStrings(savedLang))
    } else {
      const browserLang = navigator.language || "en"
      const detectedLang: Language = browserLang.startsWith("es") ? "es" : "en"
      setLang(detectedLang)
      setStrings(getLocaleStrings(detectedLang))
      localStorage.setItem("dfl_lang", detectedLang)
    }

    const platform = navigator.platform.toLowerCase()
    const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent)
    setIsMobile(isMobileDevice)
    setIsClientMode(isMobileDevice)

    if (platform.includes("win")) {
      setUserOS("windows")
    } else if (platform.includes("mac") || platform.includes("darwin")) {
      setUserOS("macos")
    } else if (platform.includes("linux") || platform.includes("unix")) {
      setUserOS("linux")
    } else {
      setUserOS("other")
    }

    const hasVisited = localStorage.getItem("dfl_visited")
    if (!hasVisited) {
      setOnboardingOpen(true)
      localStorage.setItem("dfl_visited", "true")
    }
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark)
    localStorage.setItem("dfl_theme", isDark ? "dark" : "light")
  }, [isDark])

  useEffect(() => {
    if (deck.length > 0) {
      localStorage.setItem("dfl_deck_v2", JSON.stringify(deck))
    }
  }, [deck])

  const updateOBSData = useCallback((data: { scenes?: string[]; inputs?: string[] }) => {
    setObsData((prev) => ({
      ...prev,
      scenes: (data.scenes || prev.scenes.map(s => s.sceneName)).map(name => ({ sceneName: name })),
      inputs: (data.inputs || prev.inputs.map(i => i.inputName)).map(name => ({ inputName: name })),
      allSources: [...(data.scenes || prev.scenes.map(s => s.sceneName)), ...(data.inputs || prev.inputs.map(i => i.inputName))].sort(),
    }))
    setHasOBSData(true)
  }, [])

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 2000)
  }, [])

  const startRemoteTimeout = useCallback(() => {
    if (remoteTimeoutRef.current) clearTimeout(remoteTimeoutRef.current)
    remoteTimeoutRef.current = setTimeout(() => {
      setRemoteConnectionFailed(true)
    }, 5000)
  }, [])

  const disconnectWorker = useCallback(() => {
    if (workerRef.current) {
      try {
        workerRef.current.close()
      } catch {}
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

    if (isRemoteConnected && workerRef.current) {
      console.log("[Worker] Already connected, skipping...")
      return
    }

    disconnectWorker()
    setIsConnecting(true)
    setRemoteWaitingForAgent(false)
    setRemoteConnectionFailed(false)

    try {
      const url = new URL(workerUrl)
      url.searchParams.set("code", code)
      url.searchParams.set("role", "client")

      console.log("[Worker] Connecting to:", url.toString())

      const ws = new WebSocket(url.toString())
      workerRef.current = ws

      ws.onopen = () => {
        console.log("[Worker] Socket opened, sending register...")
        ws.send(JSON.stringify({ type: "register", code: code, role: "client" }))
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string)
          console.log("[Worker] Received:", data.type)

          if (data.type === "waiting") {
            console.log("[Worker] Waiting for host...")
            setRemoteWaitingForAgent(true)
            setIsConnecting(false)
            startRemoteTimeout()
          } else if (data.type === "peer_connected") {
            console.log("[Worker] Paired with host!")
            setRemoteWaitingForAgent(false)
            setIsRemoteConnected(true)
            setConnected(true)
            setConnectionMode("remote")
            setIsConnecting(false)
            setSettingsOpen(false)
            setModalOpen(false)
            showToast(strings.toasts.connected, "success")
          } else if (data.type === "obs_data") {
            console.log("[Worker] OBS data received:", data.scenes?.length, "scenes")
            updateOBSData({
              scenes: data.scenes,
              inputs: data.inputs,
            })
            setDeck((prev) =>
              prev.map((btn) => {
                if (btn.type === "Mute") {
                  if (btn.target === "Desktop Audio" || btn.target === "Audio del escritorio") {
                    const found = data.inputs?.find((i: string) => 
                      i.toLowerCase().includes("desktop") || i.toLowerCase().includes("audio"))
                    if (found) return { ...btn, target: found }
                  }
                  if (btn.target === "Mic/Aux" || btn.target === "Mic") {
                    const found = data.inputs?.find((i: string) => 
                      i.toLowerCase().includes("mic") || i.toLowerCase().includes("aux"))
                    if (found) return { ...btn, target: found }
                  }
                }
                return btn
              }),
            )
            setSettingsOpen(false)
            setModalOpen(false)
          } else if (data.type === "obs_status") {
            setObsData((prev) => ({
              ...prev,
              rec: data.rec,
              str: data.str,
            }))
            if (typeof data.mute === "boolean") {
              setMuteStates((prev) => ({
                ...prev,
                "Audio del escritorio": data.mute,
              }))
            }
            if (typeof data.mic === "boolean") {
              setMuteStates((prev) => ({
                ...prev,
                "Mic/Aux": data.mic,
              }))
            }
          } else if (data.type === "error") {
            console.error("[Worker] Error:", data.message)
            showToast(data.message || strings.toasts.connectionError, "error")
            setIsConnecting(false)
          }
        } catch (e) {
          console.error("[Worker] Failed to parse message:", e)
        }
      }

      ws.onerror = (error) => {
        console.error("[Worker] WebSocket error:", error)
        setIsConnecting(false)
        showToast(strings.toasts.connectionError, "error")
      }

      ws.onclose = (event) => {
        console.log("[Worker] Disconnected:", event.code, event.reason)
        setIsRemoteConnected(false)
        workerRef.current = null
        if (!connected) {
          setConnected(false)
        }
      }
    } catch (error) {
      console.error("[Worker] Connection failed:", error)
      setIsConnecting(false)
      showToast(strings.toasts.connectionError, "error")
    }
  }, [joinCode, showToast, strings, isRemoteConnected, connected, startRemoteTimeout, updateOBSData, disconnectWorker])

  const connectOBS = useCallback(async () => {
    if (obsRef.current) {
      try {
        obsRef.current.disconnect()
      } catch {}
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
      setDeck((prev) =>
        prev.map((btn) => {
          if (btn.target === "Desktop Audio" && special.desktop1) return { ...btn, target: special.desktop1 as string }
          if (btn.target === "Mic/Aux" && special.mic1) return { ...btn, target: special.mic1 as string }
          return btn
        }),
      )

      const [sceneList, inputList] = await Promise.all([obs.call("GetSceneList"), obs.call("GetInputList")])

      const sourceSet = new Set<string>()
      inputList.inputs.forEach((i) => sourceSet.add(i.inputName as string))

      for (const scene of sceneList.scenes) {
        try {
          const { sceneItems } = await obs.call("GetSceneItemList", {
            sceneName: scene.sceneName as string,
          })
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
  }, [wsUrl, wsPassword, showToast])

  useEffect(() => {
    const savedUrl = localStorage.getItem("dfl_ws_url")
    const savedRemoteMode = localStorage.getItem("dfl_remote_mode")

    if (savedUrl && savedRemoteMode !== "true") {
      connectOBS()
    }
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

      interval = setInterval(syncRemoteStates, 2000)
    } else if (obsRef.current && connectionMode === "local") {
      const syncStates = async () => {
        try {
          const obs = obsRef.current
          if (!obs) return

          const [recStatus, streamStatus] = await Promise.all([obs.call("GetRecordStatus"), obs.call("GetStreamStatus")])

          setObsData((prev) => ({
            ...prev,
            rec: recStatus.outputActive,
            str: streamStatus.outputActive,
          }))

          const newMuteStates: Record<string, boolean> = {}
          for (const btn of deck) {
            if (btn.type === "Mute" && btn.target) {
              try {
                const { inputMuted } = await obs.call("GetInputMute", {
                  inputName: btn.target,
                })
                newMuteStates[btn.target] = inputMuted
              } catch {}
            }
          }
          setMuteStates(newMuteStates)
        } catch {}
      }

      interval = setInterval(syncStates, 1500)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [connected, connectionMode, isRemoteConnected, deck])

  const execute = useCallback(
    async (btn: DeckButton) => {
      if (connectionMode === "remote") {
        if (!hasOBSData) {
          showToast("Cargando datos de OBS...", "error")
          return
        }
        if (workerRef.current?.readyState === WebSocket.OPEN) {
          const command = {
            type: "obs_command",
            command: btn.type,
            args: {
              ...(btn.target && { target: btn.target }),
              ...(btn.filter && { filter: btn.filter }),
            },
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
          case "Record":
            await obs.call("ToggleRecord")
            break
          case "Stream":
            await obs.call("ToggleStream")
            break
          case "Scene":
            if (btn.target) {
              await obs.call("SetCurrentProgramScene", { sceneName: btn.target })
            }
            break
          case "Mute":
            if (btn.target) {
              await obs.call("ToggleInputMute", { inputName: btn.target })
            }
            break
          case "Filter":
            if (btn.target && btn.filter) {
              const { filterEnabled } = await obs.call("GetSourceFilter", {
                sourceName: btn.target,
                filterName: btn.filter,
              })
              await obs.call("SetSourceFilterEnabled", {
                sourceName: btn.target,
                filterName: btn.filter,
                filterEnabled: !filterEnabled,
              })
            }
            break
          case "Visibility":
            if (btn.target) {
              const { currentProgramSceneName } = await obs.call("GetCurrentProgramScene")
              const { sceneItems } = await obs.call("GetSceneItemList", {
                sceneName: currentProgramSceneName,
              })
              const item = sceneItems.find((i) => i.sourceName === btn.target)
              if (item) {
                const { sceneItemEnabled } = await obs.call("GetSceneItemEnabled", {
                  sceneName: currentProgramSceneName,
                  sceneItemId: item.sceneItemId as number,
                })
                await obs.call("SetSceneItemEnabled", {
                  sceneName: currentProgramSceneName,
                  sceneItemId: item.sceneItemId as number,
                  sceneItemEnabled: !sceneItemEnabled,
                })
              } else {
                showToast(strings.toasts.connectionError, "error")
              }
            }
            break
        }
      } catch {
        showToast(strings.toasts.connectionError, "error")
      }
    },
    [connected, showToast, connectionMode, hasOBSData, strings],
  )

  const loadFilters = useCallback(async (sourceName: string) => {
    if (!obsRef.current || !sourceName) {
      setFilters([])
      return
    }

    try {
      const { filters: filterList } = await obsRef.current.call("GetSourceFilterList", {
        sourceName,
      })
      setFilters(filterList.map((f) => f.filterName as string))
    } catch {
      setFilters([])
    }
  }, [])

  const openModal = (index: number) => {
    setCurrentIdx(index)
    const btn = deck[index] || {
      id: generateId(),
      label: "",
      type: "Mute" as ButtonType,
      target: "",
      filter: "",
      color: "#18181b",
    }
    setFormData(btn)
    if (btn.type === "Filter" && btn.target) {
      loadFilters(btn.target)
    }
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
    }

    setDeck((prev) => {
      const updated = [...prev]
      updated[currentIdx] = newBtn
      return updated
    })

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

  const handleLongPressStart = (index: number) => {
    longPressTimer.current = setTimeout(() => {
      openModal(index)
    }, 500)
  }

  const handleLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIdx(index)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", index.toString())
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDragOverIdx(index)
  }

  const handleDragLeave = () => {
    setDragOverIdx(null)
  }

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
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

  const handleDragEnd = () => {
    setDraggedIdx(null)
    setDragOverIdx(null)
  }

  const getTargetList = useMemo(() => {
    switch (formData.type) {
      case "Scene":
        return obsData.scenes.map((s) => s.sceneName)
      case "Mute":
        return obsData.inputs.map((i) => i.inputName)
      default:
        return obsData.allSources
    }
  }, [formData.type, obsData.scenes, obsData.inputs, obsData.allSources])

  const needsTarget = !["Record", "Stream"].includes(formData.type)

  return (
    <div
      className={cn(
        "min-h-screen flex flex-col transition-colors duration-300 max-w-5xl mx-auto w-full",
        isDark ? "bg-zinc-950 text-zinc-100" : "bg-zinc-50 text-zinc-900",
      )}
    >
      <div className="flex-1 flex flex-col">
        <header className={cn("sticky top-0 z-40 backdrop-blur-xl pb-2", isDark ? "bg-zinc-950/80" : "bg-zinc-50/80")}>
          <div className="flex h-20 items-center justify-between px-4">
            <div className="flex items-center gap-4">
              <Logo className="h-16 w-16" />
              <h1 className="text-2xl font-bold tracking-tight">
                DOCK<span className="text-blue-500">FORLIFE</span>
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSecurityOpen(true)}
                className={cn(
                  "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  isDark
                    ? "bg-green-500/10 text-green-400 hover:bg-green-500/20"
                    : "bg-green-100 text-green-600 hover:bg-green-200",
                )}
              >
                <Shield className="h-4 w-4" />
                <span className="hidden sm:inline">Secure</span>
              </button>
              <div
                className={cn(
                  "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold backdrop-blur-md",
                  isConnecting
                    ? isDark
                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      : "bg-amber-100 text-amber-600 border border-amber-200"
                    : connected
                      ? connectionMode === "bridge"
                        ? isDark
                          ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                          : "bg-purple-100 text-purple-600 border border-purple-200"
                        : connectionMode === "remote"
                          ? isDark
                            ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                            : "bg-blue-100 text-blue-600 border border-blue-200"
                          : isDark
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : "bg-emerald-100 text-emerald-600 border border-emerald-200"
                      : isDark
                        ? "bg-zinc-800/50 text-zinc-500 border border-zinc-700/50"
                        : "bg-zinc-200/50 text-zinc-500 border border-zinc-300/50",
                )}
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span className="hidden sm:inline">CONNECTING</span>
                  </>
                ) : connected ? (
                  connectionMode === "bridge" ? (
                    <>
                      <Wifi className="h-3 w-3 text-purple-400" />
                      <span className="hidden sm:inline text-purple-400">BRIDGE</span>
                    </>
                  ) : connectionMode === "remote" ? (
                    <>
                      <Wifi className="h-3 w-3" />
                      <span className="hidden sm:inline">REMOTE</span>
                    </>
                  ) : (
                    <>
                      <Wifi className="h-3 w-3" />
                      <span className="hidden sm:inline">LOCAL</span>
                    </>
                  )
                ) : (
                  <>
                    <WifiOff className="h-3 w-3" />
                    <span className="hidden sm:inline">OFFLINE</span>
                  </>
                )}
              </div>
              <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setIsDark(!isDark)}>
                {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setSettingsOpen(true)}>
                <Settings className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </header>

        {remoteConnectionFailed && (
          <div className={cn("px-4 py-3 text-center text-sm", isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-700")}>
            <span>{strings.toasts.agentNotRunning}</span>
            <a
              href={getGitHubReleaseUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className={cn("ml-2 underline font-medium", isDark ? "text-amber-300" : "text-amber-600")}
            >
              {strings.agent.download}
            </a>
          </div>
        )}

        {connectionMode === "remote" && !hasOBSData && (
          <div className={cn("px-4 py-6 text-center text-sm", isDark ? "bg-blue-500/10 text-blue-400" : "bg-blue-50 text-blue-600")}>
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{strings.toasts.waitingForOBS}</span>
            </div>
          </div>
        )}

        <main className="flex-1 container max-w-5xl mx-auto px-6 py-8">
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 gap-4">
            {deck.map((btn, i) => {
              const isRecording = btn.type === "Record" && obsData.rec
              const isStreaming = btn.type === "Stream" && obsData.str
              const isMuted = btn.type === "Mute" && btn.target && muteStates[btn.target]
              const isActive = isRecording || isStreaming
              const isDragging = draggedIdx === i
              const isDragOver = dragOverIdx === i

              const bgColor = isRecording ? "#ef4444" : isStreaming ? "#22c55e" : btn.color
              const textColor = getContrastColor(bgColor, isDark)

              return (
                <div
                  key={btn.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, i)}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, i)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    "relative transition-all duration-200",
                    isDragging && "opacity-50 scale-95",
                    isDragOver && "scale-105",
                  )}
                >
                  <button
                    className={cn(
                      "w-full h-24 rounded-xl sm:rounded-2xl flex flex-col items-center justify-center gap-1 sm:gap-2 transition-all relative overflow-hidden shadow-lg",
                      "active:scale-95 hover:scale-[1.02]",
                      isMuted && "opacity-50",
                    )}
                    style={{
                      backgroundColor: bgColor,
                      color: textColor,
                    }}
                    onClick={() => execute(btn)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      openModal(i)
                    }}
                    onTouchStart={() => handleLongPressStart(i)}
                    onTouchEnd={handleLongPressEnd}
                    onMouseDown={() => handleLongPressStart(i)}
                    onMouseUp={handleLongPressEnd}
                    onMouseLeave={handleLongPressEnd}
                    aria-label={`${btn.label} button`}
                  >
                    <div className="relative">
                      {getIcon(btn.type)}
                      {isMuted && <VolumeX className="absolute -top-1 -right-1 h-4 w-4" style={{ color: textColor }} />}
                    </div>
                    <span className="text-sm sm:text-base font-bold uppercase text-center px-2 leading-tight">
                      {btn.label}
                    </span>
                    {isActive && (
                      <span
                        className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full animate-pulse"
                        style={{ backgroundColor: textColor }}
                      />
                    )}
                  </button>
                </div>
              )
            })}

            <button
              className={cn(
                "aspect-square rounded-xl sm:rounded-2xl border-2 border-dashed flex items-center justify-center transition-all",
                isDark
                  ? "border-zinc-800 opacity-40 hover:opacity-100 hover:border-blue-500 hover:text-blue-500"
                  : "border-zinc-300 opacity-40 hover:opacity-100 hover:border-blue-500 hover:text-blue-500",
              )}
              onClick={() => openModal(deck.length)}
              aria-label="Add new button"
            >
              <Plus className="h-6 w-6 sm:h-8 sm:w-8" />
            </button>
          </div>
        </main>
      </div>

      <footer className={cn("py-8 px-4 border-t", isDark ? "bg-zinc-900/50 border-zinc-800" : "bg-zinc-100/50 border-zinc-200")}>
        <div className="flex flex-col items-center gap-4">
          <Logo className="h-16 w-16 opacity-40" />

          <a
            href="https://paypal.me/daurydicaprio"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-full text-sm font-medium",
              isDark
                ? "bg-pink-500/10 text-pink-400 hover:bg-pink-500/20"
                : "bg-pink-100 text-pink-600 hover:bg-pink-200",
            )}
          >
            <Heart className="h-4 w-4" />
            Donar
          </a>

          <div className="text-center space-y-1">
            <p className={cn("text-sm", isDark ? "text-zinc-500" : "text-zinc-400")}>
              Made with love by{" "}
              <a
                href="https://daurydicaprio.com"
                target="_blank"
                rel="noopener noreferrer"
                className={cn("font-medium", isDark ? "text-zinc-300 hover:text-blue-400" : "text-zinc-700 hover:text-blue-600")}
              >
                Daury DiCaprio
              </a>
            </p>
            <p className={cn("text-sm font-bold", isDark ? "text-zinc-500" : "text-zinc-400")}>
              v1.0.0-beta
            </p>
          </div>
        </div>
      </footer>

      <Dialog open={onboardingOpen} onOpenChange={setOnboardingOpen}>
        <DialogContent
          className={cn(
            "sm:max-w-md backdrop-blur-xl border",
            isDark ? "bg-zinc-900/95 border-zinc-800" : "bg-white/95 border-zinc-200",
          )}
        >
          <DialogHeader>
            <div className="flex items-center justify-center mb-4">
              <Logo className="h-16 w-16" />
            </div>
            <DialogTitle className="text-center text-xl">
              Welcome to DOCK<span className="text-blue-500">FORLIFE</span>
            </DialogTitle>
            <DialogDescription className="text-center text-sm text-zinc-500">
              Control OBS from any device on your local network
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Requirements:</h4>

              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  {connected ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className={cn("h-5 w-5 shrink-0 mt-0.5", isDark ? "text-zinc-600" : "text-zinc-400")} />
                  )}
                  <div>
                    <p className="text-sm font-medium">OBS Studio running</p>
                    <p className={cn("text-xs", isDark ? "text-zinc-500" : "text-zinc-400")}>
                      Make sure OBS is open and running
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  {connected ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className={cn("h-5 w-5 shrink-0 mt-0.5", isDark ? "text-zinc-600" : "text-zinc-400")} />
                  )}
                  <div>
                    <p className="text-sm font-medium">WebSocket Server enabled</p>
                    <p className={cn("text-xs", isDark ? "text-zinc-500" : "text-zinc-400")}>
                      In OBS: Tools &gt; WebSocket Server Settings
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Port 4455 (default)</p>
                    <p className={cn("text-xs", isDark ? "text-zinc-500" : "text-zinc-400")}>
                      You can change this in settings
                    </p>
                  </div>
                </div>
              </div>

              <div
                className={cn(
                  "p-3 rounded-lg text-xs",
                  isDark ? "bg-blue-500/10 text-blue-400" : "bg-blue-50 text-blue-600",
                )}
              >
                <p className="font-medium mb-1">To use from another device:</p>
                <p>Use your PC IP instead of 127.0.0.1</p>
                <p className="mt-1 opacity-75">Example: ws://192.168.1.100:4455</p>
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              onClick={() => {
                setOnboardingOpen(false)
                setSettingsOpen(true)
              }}
              className="w-full"
            >
              Configure Connection
            </Button>
            <Button variant="ghost" onClick={() => setOnboardingOpen(false)} className="w-full">
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={securityOpen} onOpenChange={setSecurityOpen}>
        <DialogContent
          className={cn(
            "sm:max-w-md backdrop-blur-xl border",
            isDark ? "bg-zinc-900/95 border-zinc-800" : "bg-white/95 border-zinc-200",
          )}
        >
          <DialogHeader>
            <div className="flex items-center justify-center mb-4">
              <div className={cn("p-4 rounded-full", isDark ? "bg-green-500/10" : "bg-green-100")}>
                <Shield className="h-10 w-10 text-green-500" />
              </div>
            </div>
            <DialogTitle className="text-center text-xl">Security & Privacy</DialogTitle>
            <DialogDescription className="text-center text-sm text-zinc-500">
              Important information about how DockForLife protects your data
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className={cn("p-2 rounded-lg shrink-0", isDark ? "bg-zinc-800" : "bg-zinc-100")}>
                  <HardDrive className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">100% Local</p>
                  <p className={cn("text-xs", isDark ? "text-zinc-500" : "text-zinc-400")}>
                    All data is stored ONLY on your device using localStorage. No external servers.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className={cn("p-2 rounded-lg shrink-0", isDark ? "bg-zinc-800" : "bg-zinc-100")}>
                  <Lock className="h-4 w-4 text-green-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">No data collection</p>
                  <p className={cn("text-xs", isDark ? "text-zinc-500" : "text-zinc-400")}>
                    We do not collect, store, or transmit any personal or usage information.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className={cn("p-2 rounded-lg shrink-0", isDark ? "bg-zinc-800" : "bg-zinc-100")}>
                  <Wifi className="h-4 w-4 text-purple-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Direct connection</p>
                  <p className={cn("text-xs", isDark ? "text-zinc-500" : "text-zinc-400")}>
                    The app connects directly to OBS on your local network. No intermediaries.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setSecurityOpen(false)} className="w-full">
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent
          id="settings-dialog"
          className={cn(
            "sm:max-w-md backdrop-blur-2xl bg-white/70 dark:bg-zinc-950/70 border-white/20 shadow-2xl",
            isDark ? "text-white" : "text-zinc-900"
          )}
          style={{
            backgroundImage: `radial-gradient(circle at 50% 0%, rgba(59, 130, 246, 0.1) 0%, transparent 50%)`,
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent dark:from-white/5 pointer-events-none rounded-[inherit]" />
          <DialogHeader className="relative">
            <DialogTitle className="flex items-center justify-center gap-2 text-xl">
              <div className={cn(
                "p-2 rounded-xl",
                isDark ? "bg-blue-500/20" : "bg-blue-100"
              )}>
                <Wifi className="h-5 w-5 text-blue-500" />
              </div>
              {isClientMode ? strings.agent.title : strings.settings.title}
            </DialogTitle>
            <DialogDescription className="text-center text-sm text-zinc-500 dark:text-zinc-400">
              {isClientMode ? strings.agent.desc : strings.settings.remoteModeDesc}
            </DialogDescription>
          </DialogHeader>

          {isClientMode ? (
            <div className="space-y-6 py-4">
              <div className="space-y-4">
                <Label htmlFor="client-join-code" className="text-center block text-lg font-medium">
                  {strings.settings.joinCode}
                </Label>
                <Input
                  id="client-join-code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder={strings.settings.joinCodePlaceholder}
                  maxLength={12}
                  className={cn(
                    "text-center text-xl font-mono tracking-widest py-6",
                    isDark ? "bg-zinc-800 border-zinc-700" : ""
                  )}
                />
              </div>

              <Button
                size="lg"
                className="w-full py-6 text-lg"
                disabled={joinCode.length < 4 || isConnecting}
                onClick={() => {
                  if (connected && obsRef.current) {
                    try {
                      obsRef.current.disconnect()
                    } catch {}
                    obsRef.current = null
                    setConnected(false)
                  }
                  setIsRemoteMode(true)
                  connectToWorker()
                }}
              >
                {isConnecting ? strings.settings.connecting : strings.settings.button}
              </Button>

              {remoteWaitingForAgent && (
                <div className={cn("p-4 rounded-lg text-center", isDark ? "bg-amber-500/10" : "bg-amber-50")}>
                  <p className={cn("text-sm", isDark ? "text-amber-400" : "text-amber-700")}>
                    {strings.toasts.agentNotRunning}
                  </p>
                </div>
              )}

              {connected && (
                <div className={cn("p-4 rounded-lg text-center", isDark ? "bg-green-500/10" : "bg-green-50")}>
                  <p className={cn("text-sm font-medium", isDark ? "text-green-400" : "text-green-700")}>
                    {strings.toasts.connected}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className={cn("space-y-2", isRemoteMode && "opacity-50")}>
                <Label htmlFor="ws-url">{strings.settings.wsUrl}</Label>
                <Input
                  id="ws-url"
                  value={wsUrl}
                  onChange={(e) => setWsUrl(e.target.value)}
                  placeholder={strings.settings.wsUrlPlaceholder}
                  disabled={isRemoteMode}
                  className={cn(isDark ? "bg-zinc-800 border-zinc-700" : "", isRemoteMode && "opacity-50 cursor-not-allowed")}
                />
                <p className={cn("text-xs", isDark ? "text-zinc-500" : "text-zinc-400")}>
                  {strings.settings.wsUrlHint}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="join-code">{strings.settings.joinCode}</Label>
                <Input
                  id="join-code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder={strings.settings.joinCodePlaceholder}
                  maxLength={12}
                  className={cn(
                    "font-mono tracking-widest uppercase",
                    isDark ? "bg-zinc-800 border-zinc-700" : ""
                  )}
                />
                <p className={cn("text-xs", isDark ? "text-zinc-500" : "text-zinc-400")}>
                  {strings.settings.joinCodeHint}
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => {
                    console.log("[UI] Switching to Local mode...")
                    disconnectWorker()
                    setIsRemoteMode(false)
                    connectOBS()
                  }}
                  disabled={isConnecting && !isRemoteMode}
                >
                  {isConnecting && !isRemoteMode ? strings.settings.connecting : strings.settings.local}
                </Button>
                <Button
                  variant={isRemoteMode ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => {
                    console.log("[UI] Switching to Remote mode...")
                    disconnectWorker()
                    setIsRemoteMode(true)
                    connectToWorker()
                  }}
                  disabled={isConnecting && isRemoteMode}
                >
                  {isConnecting && isRemoteMode ? strings.settings.connecting : strings.settings.remote}
                </Button>
              </div>

              <div className={cn("pt-4 border-t", isDark ? "border-zinc-800" : "border-zinc-200")}>
                <Label>{strings.settings.language}</Label>
                <div className="flex gap-2 mt-2">
                  <Button
                    variant={lang === "en" ? "default" : "outline"}
                    className="flex-1"
                    onClick={() => {
                      setLang("en")
                      setStrings(getLocaleStrings("en"))
                      localStorage.setItem("dfl_lang", "en")
                    }}
                  >
                    English
                  </Button>
                  <Button
                    variant={lang === "es" ? "default" : "outline"}
                    className="flex-1"
                    onClick={() => {
                      setLang("es")
                      setStrings(getLocaleStrings("es"))
                      localStorage.setItem("dfl_lang", "es")
                    }}
                  >
                    Español
                  </Button>
                </div>
              </div>

              <div className={cn("pt-4 border-t", isDark ? "border-zinc-800" : "border-zinc-200")}>
                <Label>{strings.agent.title}</Label>
                <p className={cn("text-xs mt-1 mb-3", isDark ? "text-zinc-500" : "text-zinc-400")}>
                  {strings.agent.desc}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => window.open(getGitHubReleaseUrl(), "_blank")}
                  >
                    Linux
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => window.open(getGitHubReleaseUrl(), "_blank")}
                  >
                    macOS
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => window.open(getGitHubReleaseUrl(), "_blank")}
                  >
                    Windows
                  </Button>
                </div>
                <p className={cn("text-xs mt-2 italic", isDark ? "text-zinc-600" : "text-zinc-400")}>
                  {strings.agent.note}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          className={cn(
            "sm:max-w-sm backdrop-blur-xl border",
            isDark ? "bg-zinc-900/95 border-zinc-800" : "bg-white/95 border-zinc-200",
          )}
        >
          <DialogHeader>
            <DialogTitle>{currentIdx !== null ? strings.dialogs.editTitle : strings.dialogs.addTitle}</DialogTitle>
            <DialogDescription className="text-sm text-zinc-500">
              {currentIdx !== null ? "Edit button properties" : "Create a new button"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="label">Label</Label>
              <Input
                id="label"
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                placeholder="Button name"
                className={isDark ? "bg-zinc-800 border-zinc-700" : ""}
              />
            </div>

            <div className="space-y-2">
              <Label>Action</Label>
              <Select
                value={formData.type}
                onValueChange={(value: ButtonType) => {
                  setFormData({ ...formData, type: value, target: "", filter: "" })
                  setFilters([])
                }}
              >
                <SelectTrigger className={isDark ? "bg-zinc-800 border-zinc-700" : ""}>
                  <SelectValue />
                </SelectTrigger>
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
                <Label>Target</Label>
                <Select
                  value={formData.target || ""}
                  onValueChange={(value) => {
                    setFormData({ ...formData, target: value, filter: "" })
                    if (formData.type === "Filter") {
                      loadFilters(value)
                    }
                  }}
                >
                  <SelectTrigger className={isDark ? "bg-zinc-800 border-zinc-700" : ""}>
                    <SelectValue placeholder="Select target" />
                  </SelectTrigger>
                  <SelectContent>
                    {getTargetList.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {formData.type === "Filter" && (
              <div className="space-y-2">
                <Label>Filter</Label>
                <Select
                  value={formData.filter || ""}
                  onValueChange={(value) => setFormData({ ...formData, filter: value })}
                >
                  <SelectTrigger className={isDark ? "bg-zinc-800 border-zinc-700" : ""}>
                    <SelectValue placeholder="Select filter" />
                  </SelectTrigger>
                  <SelectContent>
                    {filters.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button
                    key={c.value}
                    className={cn(
                      "h-10 w-10 rounded-lg border-2 transition-all",
                      formData.color === c.value
                        ? "border-blue-500 ring-2 ring-blue-500 ring-offset-2"
                        : isDark
                          ? "border-zinc-700"
                          : "border-zinc-300",
                      isDark ? "ring-offset-zinc-900" : "ring-offset-white",
                    )}
                    style={{ backgroundColor: c.value }}
                    onClick={() => setFormData({ ...formData, color: c.value })}
                    aria-label={`Select ${c.label} color`}
                  />
                ))}
                <Input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="h-10 w-10 p-0 border-0 cursor-pointer"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="flex gap-2 sm:flex-row">
            {currentIdx !== null && (
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => setDeleteDialogOpen(true)}
              >
                Delete
              </Button>
            )}
            <Button className="flex-1" onClick={saveButton}>
              {strings.dialogs.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent
          className={cn(
            "sm:max-w-sm backdrop-blur-xl border",
            isDark ? "bg-zinc-900/95 border-zinc-800" : "bg-white/95 border-zinc-200",
          )}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{strings.dialogs.deleteTitle}</AlertDialogTitle>
            <AlertDialogDesc>{strings.dialogs.deleteDesc}</AlertDialogDesc>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2 sm:flex-row">
            <AlertDialogCancel className="flex-1">{strings.dialogs.cancel}</AlertDialogCancel>
            <AlertDialogAction className="flex-1 bg-red-600 hover:bg-red-700" onClick={deleteButton}>
              {strings.dialogs.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {toast && (
        <div
          className={cn(
            "fixed bottom-24 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-full shadow-lg animate-fade-in z-50",
            toast.type === "success"
              ? isDark
                ? "bg-green-500/90 text-white"
                : "bg-green-500 text-white"
              : isDark
                ? "bg-red-500/90 text-white"
                : "bg-red-500 text-white",
          )}
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}
