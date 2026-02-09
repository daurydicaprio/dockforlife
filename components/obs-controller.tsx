"use client"

import type React from "react"
import { useState, useEffect, useCallback, useRef } from "react"
import OBSWebSocket from "obs-websocket-js"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
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
    <svg viewBox="0 0 48 48" className={className} fill="currentColor">
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
  const [deck, setDeck] = useState<DeckButton[]>([])
  const [connected, setConnected] = useState(false)
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
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [muteStates, setMuteStates] = useState<Record<string, boolean>>({})
  const [isDark, setIsDark] = useState(true)
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)

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
    if (savedUrl) setWsUrl(savedUrl)
    if (savedPass) setWsPassword(savedPass)

    // Show onboarding on first visit
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

  // Save deck to localStorage
  useEffect(() => {
    if (deck.length > 0) {
      localStorage.setItem("dfl_deck_v2", JSON.stringify(deck))
    }
  }, [deck])

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 2000)
  }, [])

  const connectOBS = useCallback(async () => {
    if (obsRef.current) {
      try {
        await obsRef.current.disconnect()
      } catch {}
    }

    setIsConnecting(true)
    const obs = new OBSWebSocket()
    obsRef.current = obs

    try {
      await obs.connect(wsUrl, wsPassword || undefined, { rpcVersion: 1 })
      setConnected(true)
      showToast("Conectado a OBS", "success")

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

      localStorage.setItem("dfl_ws_url", wsUrl)
      localStorage.setItem("dfl_ws_pass", wsPassword)
    } catch {
      setConnected(false)
      showToast("Error al conectar con OBS", "error")
    } finally {
      setIsConnecting(false)
    }
  }, [wsUrl, wsPassword, showToast])

  useEffect(() => {
    const savedUrl = localStorage.getItem("dfl_ws_url")
    if (savedUrl) {
      connectOBS()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync states periodically
  useEffect(() => {
    if (!connected || !obsRef.current) return

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

    syncStates()
    const interval = setInterval(syncStates, 1500)
    return () => clearInterval(interval)
  }, [connected, deck])

  const execute = useCallback(
    async (btn: DeckButton) => {
      if (!obsRef.current || !connected) {
        showToast("No conectado a OBS", "error")
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
                showToast(`"${btn.target}" no encontrado`, "error")
              }
            }
            break
        }
      } catch {
        showToast("Accion fallida", "error")
      }
    },
    [connected, showToast],
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
    showToast("Boton guardado", "success")
  }

  const deleteButton = () => {
    if (currentIdx === null) return
    setDeck((prev) => prev.filter((_, i) => i !== currentIdx))
    setModalOpen(false)
    setDeleteDialogOpen(false)
    showToast("Boton eliminado", "success")
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
    showToast("Orden actualizado", "success")
  }

  const handleDragEnd = () => {
    setDraggedIdx(null)
    setDragOverIdx(null)
  }

  const getTargetList = () => {
    switch (formData.type) {
      case "Scene":
        return obsData.scenes.map((s) => s.sceneName)
      case "Mute":
        return obsData.inputs.map((i) => i.inputName)
      default:
        return obsData.allSources
    }
  }

  const needsTarget = !["Record", "Stream"].includes(formData.type)

  return (
    <div
      className={cn(
        "min-h-screen flex flex-col transition-colors duration-300",
        isDark ? "bg-zinc-950 text-zinc-100" : "bg-zinc-50 text-zinc-900",
      )}
    >
      {/* Header */}
      <header
        className={cn(
          "sticky top-0 z-40 border-b backdrop-blur-xl",
          isDark ? "border-zinc-800/50 bg-zinc-950/80" : "border-zinc-200/50 bg-zinc-50/80",
        )}
      >
        <div className="container flex h-14 max-w-screen-xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Logo className="h-7 w-7" />
            <div className="flex flex-col">
              <h1 className="text-sm font-bold tracking-tight leading-none">
                DOCK<span className="text-blue-500">FORLIFE</span>
              </h1>
              <span className={cn("text-[9px] font-mono", isDark ? "text-zinc-500" : "text-zinc-400")}>
                v0.001 BETA
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setSecurityOpen(true)}
              className={cn(
                "flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium transition-colors",
                isDark
                  ? "bg-green-500/10 text-green-400 hover:bg-green-500/20"
                  : "bg-green-100 text-green-600 hover:bg-green-200",
              )}
            >
              <Shield className="h-3 w-3" />
              Seguro
            </button>
            <div
              className={cn(
                "flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold",
                connected
                  ? isDark
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-emerald-100 text-emerald-600"
                  : isDark
                    ? "bg-zinc-800 text-zinc-500"
                    : "bg-zinc-200 text-zinc-500",
              )}
            >
              {connected ? (
                <>
                  <Wifi className="h-3 w-3" />
                  <span className="hidden sm:inline">ONLINE</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3" />
                  <span className="hidden sm:inline">OFFLINE</span>
                </>
              )}
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsDark(!isDark)}>
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSettingsOpen(true)}>
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 container max-w-screen-xl px-3 py-4 sm:px-4 sm:py-6">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 sm:gap-3">
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
                  "relative aspect-square transition-all duration-200",
                  isDragging && "opacity-50 scale-95",
                  isDragOver && "scale-105",
                )}
              >
                <button
                  className={cn(
                    "w-full h-full rounded-xl sm:rounded-2xl flex flex-col items-center justify-center gap-1 sm:gap-2 transition-all relative overflow-hidden",
                    "hover:scale-[1.02] active:scale-95",
                    "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                    isDark ? "focus:ring-offset-zinc-950" : "focus:ring-offset-zinc-50",
                    isMuted && "opacity-50",
                    isDragOver && (isDark ? "ring-2 ring-blue-500" : "ring-2 ring-blue-400"),
                  )}
                  style={{
                    backgroundColor: bgColor,
                    color: textColor,
                    boxShadow: isActive ? `0 0 20px ${bgColor}66` : undefined,
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
                >
                  {/* Drag handle indicator */}
                  <div className="absolute top-1 left-1/2 -translate-x-1/2 opacity-30">
                    <GripVertical className="h-3 w-3" />
                  </div>

                  <div className="relative">
                    {getIcon(btn.type)}
                    {isMuted && <VolumeX className="absolute -top-1 -right-1 h-3 w-3" style={{ color: textColor }} />}
                  </div>
                  <span className="text-[10px] sm:text-xs font-bold uppercase text-center px-1 leading-tight line-clamp-2">
                    {btn.label}
                  </span>
                  {isActive && (
                    <span
                      className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full animate-pulse"
                      style={{ backgroundColor: textColor }}
                    />
                  )}
                </button>
              </div>
            )
          })}

          {/* Add Button */}
          <button
            className={cn(
              "aspect-square rounded-xl sm:rounded-2xl border-2 border-dashed flex items-center justify-center transition-all",
              isDark
                ? "border-zinc-800 opacity-40 hover:opacity-100 hover:border-blue-500 hover:text-blue-500"
                : "border-zinc-300 opacity-40 hover:opacity-100 hover:border-blue-500 hover:text-blue-500",
            )}
            onClick={() => openModal(deck.length)}
          >
            <Plus className="h-6 w-6 sm:h-8 sm:w-8" />
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer
        className={cn(
          "border-t py-4 px-4",
          isDark ? "border-zinc-800/50 bg-zinc-900/50" : "border-zinc-200/50 bg-zinc-100/50",
        )}
      >
        <div className="container max-w-screen-xl flex flex-col items-center gap-3">
          <Logo className="h-8 w-8 opacity-30" />

          {/* Donate button */}
          <a
            href="https://paypal.me/daurydicaprio"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
              isDark
                ? "bg-pink-500/10 text-pink-400 hover:bg-pink-500/20"
                : "bg-pink-100 text-pink-600 hover:bg-pink-200",
            )}
          >
            <Heart className="h-4 w-4" />
            Donar
          </a>

          <div className="text-center space-y-1">
            <p className={cn("text-xs", isDark ? "text-zinc-500" : "text-zinc-400")}>
              Made with love by{" "}
              <a
                href="https://daurydicaprio.com"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "font-medium transition-colors",
                  isDark ? "text-zinc-300 hover:text-blue-400" : "text-zinc-700 hover:text-blue-600",
                )}
              >
                Daury DiCaprio
              </a>
            </p>
            <p className={cn("text-[10px] font-medium", isDark ? "text-zinc-600" : "text-zinc-400")}>
              #verygoodforlife
            </p>
          </div>

          <p className={cn("text-[10px]", isDark ? "text-zinc-700" : "text-zinc-400")}>v0.001 BETA</p>
        </div>
      </footer>

      {/* Onboarding Modal */}
      <Dialog open={onboardingOpen} onOpenChange={setOnboardingOpen}>
        <DialogContent
          className={cn(
            "sm:max-w-md backdrop-blur-xl border",
            isDark ? "bg-zinc-900/95 border-zinc-800" : "bg-white/95 border-zinc-200",
          )}
        >
          <DialogHeader>
            <div className="flex items-center justify-center mb-4">
              <Logo className="h-12 w-12" />
            </div>
            <DialogTitle className="text-center text-xl">
              Bienvenido a DOCK<span className="text-blue-500">FORLIFE</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className={cn("text-sm text-center", isDark ? "text-zinc-400" : "text-zinc-600")}>
              Controla OBS desde cualquier dispositivo en tu red local
            </p>

            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Requisitos:</h4>

              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  {connected ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className={cn("h-5 w-5 shrink-0 mt-0.5", isDark ? "text-zinc-600" : "text-zinc-400")} />
                  )}
                  <div>
                    <p className="text-sm font-medium">OBS Studio abierto</p>
                    <p className={cn("text-xs", isDark ? "text-zinc-500" : "text-zinc-400")}>
                      Asegurate de tener OBS ejecutandose
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
                    <p className="text-sm font-medium">WebSocket Server activo</p>
                    <p className={cn("text-xs", isDark ? "text-zinc-500" : "text-zinc-400")}>
                      En OBS: Herramientas &gt; Configuracion de WebSocket Server
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Puerto 4455 (por defecto)</p>
                    <p className={cn("text-xs", isDark ? "text-zinc-500" : "text-zinc-400")}>
                      Puedes cambiarlo en configuracion
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
                <p className="font-medium mb-1">Para usar desde otro dispositivo:</p>
                <p>Usa la IP de tu PC en lugar de 127.0.0.1</p>
                <p className="mt-1 opacity-75">Ejemplo: ws://192.168.1.100:4455</p>
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
              Configurar conexion
            </Button>
            <Button variant="ghost" onClick={() => setOnboardingOpen(false)} className="w-full">
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Security Info Modal */}
      <Dialog open={securityOpen} onOpenChange={setSecurityOpen}>
        <DialogContent
          className={cn(
            "sm:max-w-md backdrop-blur-xl border",
            isDark ? "bg-zinc-900/95 border-zinc-800" : "bg-white/95 border-zinc-200",
          )}
        >
          <DialogHeader>
            <div className="flex items-center justify-center mb-4">
              <div className={cn("p-3 rounded-full", isDark ? "bg-green-500/10" : "bg-green-100")}>
                <Shield className="h-8 w-8 text-green-500" />
              </div>
            </div>
            <DialogTitle className="text-center text-xl">Seguridad y Privacidad</DialogTitle>
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
                    Todos tus datos se almacenan SOLO en tu dispositivo usando localStorage. No usamos servidores
                    externos.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className={cn("p-2 rounded-lg shrink-0", isDark ? "bg-zinc-800" : "bg-zinc-100")}>
                  <Lock className="h-4 w-4 text-green-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Sin recoleccion de datos</p>
                  <p className={cn("text-xs", isDark ? "text-zinc-500" : "text-zinc-400")}>
                    No recopilamos, almacenamos ni transmitimos ninguna informacion personal o de uso.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className={cn("p-2 rounded-lg shrink-0", isDark ? "bg-zinc-800" : "bg-zinc-100")}>
                  <Wifi className="h-4 w-4 text-purple-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Conexion directa</p>
                  <p className={cn("text-xs", isDark ? "text-zinc-500" : "text-zinc-400")}>
                    La app se conecta directamente a OBS en tu red local. No hay intermediarios.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className={cn("p-2 rounded-lg shrink-0", isDark ? "bg-zinc-800" : "bg-zinc-100")}>
                  <Globe className="h-4 w-4 text-orange-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Funciona offline</p>
                  <p className={cn("text-xs", isDark ? "text-zinc-500" : "text-zinc-400")}>
                    Una vez instalada, la app funciona sin internet. Solo necesitas conexion a tu red local para OBS.
                  </p>
                </div>
              </div>
            </div>

            <div className={cn("p-3 rounded-lg text-xs text-center", isDark ? "bg-zinc-800" : "bg-zinc-100")}>
              <p className={isDark ? "text-zinc-400" : "text-zinc-600"}>
                Tu configuracion y botones se guardan localmente. Puedes borrarlos en cualquier momento limpiando los
                datos del sitio.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setSecurityOpen(false)} className="w-full">
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Button Config Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          className={cn(
            "sm:max-w-md backdrop-blur-xl border",
            isDark ? "bg-zinc-900/95 border-zinc-800" : "bg-white/95 border-zinc-200",
          )}
        >
          <DialogHeader>
            <DialogTitle>Configurar boton</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="label">Etiqueta</Label>
              <Input
                id="label"
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                placeholder="Nombre del boton"
                className={isDark ? "bg-zinc-800 border-zinc-700" : ""}
              />
            </div>

            <div className="space-y-2">
              <Label>Accion</Label>
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
                  <SelectItem value="Mute">Silenciar Audio</SelectItem>
                  <SelectItem value="Visibility">Alternar Visibilidad</SelectItem>
                  <SelectItem value="Filter">Alternar Filtro</SelectItem>
                  <SelectItem value="Scene">Cambiar Escena</SelectItem>
                  <SelectItem value="Record">Grabar</SelectItem>
                  <SelectItem value="Stream">Transmitir</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {needsTarget && (
              <div className="space-y-2">
                <Label>Objetivo</Label>
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
                    <SelectValue placeholder="Seleccionar objetivo" />
                  </SelectTrigger>
                  <SelectContent>
                    {getTargetList().map((item) => (
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
                <Label>Filtro</Label>
                <Select
                  value={formData.filter || ""}
                  onValueChange={(value) => setFormData({ ...formData, filter: value })}
                >
                  <SelectTrigger className={isDark ? "bg-zinc-800 border-zinc-700" : ""}>
                    <SelectValue placeholder="Seleccionar filtro" />
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
                      "h-8 w-8 rounded-lg border-2 transition-all",
                      formData.color === c.value
                        ? "border-blue-500 ring-2 ring-blue-500 ring-offset-2"
                        : isDark
                          ? "border-zinc-700"
                          : "border-zinc-300",
                      isDark ? "ring-offset-zinc-900" : "ring-offset-white",
                    )}
                    style={{ backgroundColor: c.value }}
                    onClick={() => setFormData({ ...formData, color: c.value })}
                  />
                ))}
                <Input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="h-8 w-8 p-0 border-0 cursor-pointer"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button onClick={saveButton} className="w-full">
              Guardar
            </Button>
            {currentIdx !== null && currentIdx < deck.length && (
              <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)} className="w-full">
                Eliminar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className={isDark ? "bg-zinc-900 border-zinc-800" : ""}>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar boton?</AlertDialogTitle>
            <AlertDialogDescription>Esta accion no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteButton}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Settings Modal */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent
          className={cn(
            "sm:max-w-md backdrop-blur-xl border",
            isDark ? "bg-zinc-900/95 border-zinc-800" : "bg-white/95 border-zinc-200",
          )}
        >
          <DialogHeader>
            <DialogTitle>Conexion OBS</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ws-url">URL WebSocket</Label>
              <Input
                id="ws-url"
                value={wsUrl}
                onChange={(e) => setWsUrl(e.target.value)}
                placeholder="ws://127.0.0.1:4455"
                className={isDark ? "bg-zinc-800 border-zinc-700" : ""}
              />
              <p className={cn("text-xs", isDark ? "text-zinc-500" : "text-zinc-400")}>
                Para otro dispositivo usa la IP de tu PC
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ws-pass">Contrasena (opcional)</Label>
              <Input
                id="ws-pass"
                type="password"
                value={wsPassword}
                onChange={(e) => setWsPassword(e.target.value)}
                placeholder="Contrasena de WebSocket OBS"
                className={isDark ? "bg-zinc-800 border-zinc-700" : ""}
              />
            </div>

            <div
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
                connected
                  ? isDark
                    ? "bg-green-500/10 text-green-400"
                    : "bg-green-100 text-green-600"
                  : isDark
                    ? "bg-zinc-800 text-zinc-400"
                    : "bg-zinc-100 text-zinc-600",
              )}
            >
              {connected ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Conectado a OBS
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4" />
                  No conectado
                </>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={connectOBS} className="w-full" disabled={isConnecting}>
              {isConnecting ? "Conectando..." : connected ? "Reconectar" : "Conectar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-sm font-medium z-50 shadow-lg",
            toast.type === "success" ? "bg-green-500 text-white" : "bg-red-500 text-white",
          )}
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}
