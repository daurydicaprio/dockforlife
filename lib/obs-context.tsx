"use client"

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react"

interface OBSInput {
  inputName: string
  muted?: boolean
}

interface OBSScene {
  sceneName: string
}

interface OBSData {
  scenes: OBSScene[]
  inputs: OBSInput[]
  allSources: string[]
  rec: boolean
  str: boolean
}

interface OBSContextType {
  obsData: OBSData
  updateOBSData: (data: { scenes?: string[]; inputs?: string[] }) => void
  setRecording: (rec: boolean) => void
  setStreaming: (str: boolean) => void
  clearOBSData: () => void
}

const defaultOBSData: OBSData = {
  scenes: [],
  inputs: [],
  allSources: [],
  rec: false,
  str: false,
}

const OBSContext = createContext<OBSContextType | undefined>(undefined)

export function OBSProvider({ children }: { children: ReactNode }) {
  const [obsData, setObsData] = useState<OBSData>(defaultOBSData)

  const updateOBSData = useCallback((data: { scenes?: string[]; inputs?: string[] }) => {
    setObsData((prev) => {
      const scenes = data.scenes || prev.scenes.map(s => s.sceneName)
      const inputs = data.inputs || prev.inputs.map(i => i.inputName)
      
      return {
        ...prev,
        scenes: scenes.map(name => ({ sceneName: name })),
        inputs: inputs.map(name => ({ inputName: name })),
        allSources: [...scenes, ...inputs].sort(),
      }
    })
  }, [])

  const setRecording = useCallback((rec: boolean) => {
    setObsData((prev) => ({ ...prev, rec }))
  }, [])

  const setStreaming = useCallback((str: boolean) => {
    setObsData((prev) => ({ ...prev, str }))
  }, [])

  const clearOBSData = useCallback(() => {
    setObsData(defaultOBSData)
  }, [])

  return (
    <OBSContext.Provider
      value={{
        obsData,
        updateOBSData,
        setRecording,
        setStreaming,
        clearOBSData,
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
