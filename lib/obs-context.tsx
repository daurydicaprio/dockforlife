"use client"

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react"

// Centralized OBS State Store - Single Source of Truth
export interface OBSState {
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

interface OBSContextType {
  obsState: OBSState
  setOBSState: React.Dispatch<React.SetStateAction<OBSState>>
  updateMuteState: (inputName: string, muted: boolean) => void
  updateRecording: (rec: boolean) => void
  updateStreaming: (str: boolean) => void
  updateCurrentScene: (sceneName: string) => void
  updateVisibilityState: (sceneName: string, sceneItemId: number, enabled: boolean) => void
  updateFilterState: (sourceName: string, filterName: string, enabled: boolean) => void
  resetOBSState: () => void
}

const defaultOBSState: OBSState = {
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
}

const OBSContext = createContext<OBSContextType | undefined>(undefined)

export function OBSProvider({ children }: { children: ReactNode }) {
  const [obsState, setOBSState] = useState<OBSState>(defaultOBSState)

  const updateMuteState = useCallback((inputName: string, muted: boolean) => {
    setOBSState((prev) => ({
      ...prev,
      muteStates: { ...prev.muteStates, [inputName]: muted },
      lastUpdate: Date.now(),
    }))
  }, [])

  const updateRecording = useCallback((rec: boolean) => {
    setOBSState((prev) => ({
      ...prev,
      rec,
      lastUpdate: Date.now(),
    }))
  }, [])

  const updateStreaming = useCallback((str: boolean) => {
    setOBSState((prev) => ({
      ...prev,
      str,
      lastUpdate: Date.now(),
    }))
  }, [])

  const updateCurrentScene = useCallback((sceneName: string) => {
    setOBSState((prev) => ({
      ...prev,
      currentScene: sceneName,
      lastUpdate: Date.now(),
    }))
  }, [])

  const updateVisibilityState = useCallback((sceneName: string, sceneItemId: number, enabled: boolean) => {
    setOBSState((prev) => ({
      ...prev,
      visibilityStates: { ...prev.visibilityStates, [`${sceneName}-${sceneItemId}`]: enabled },
      lastUpdate: Date.now(),
    }))
  }, [])

  const updateFilterState = useCallback((sourceName: string, filterName: string, enabled: boolean) => {
    setOBSState((prev) => ({
      ...prev,
      filterStates: { ...prev.filterStates, [`${sourceName}-${filterName}`]: enabled },
      lastUpdate: Date.now(),
    }))
  }, [])

  const resetOBSState = useCallback(() => {
    setOBSState(defaultOBSState)
  }, [])

  return (
    <OBSContext.Provider
      value={{
        obsState,
        setOBSState,
        updateMuteState,
        updateRecording,
        updateStreaming,
        updateCurrentScene,
        updateVisibilityState,
        updateFilterState,
        resetOBSState,
      }}
    >
      {children}
    </OBSContext.Provider>
  )
}

export function useOBS() {
  const context = useContext(OBSContext)
  if (!context) {
    throw new Error("useOBS must be used within an OBSProvider")
  }
  return context
}

export { OBSContext }
