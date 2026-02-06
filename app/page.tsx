"use client"

import dynamic from "next/dynamic"

const OBSController = dynamic(() => import("@/components/obs-controller").then(mod => mod.OBSController), {
  ssr: false,
  loading: () => <p className="text-white text-center mt-10">Loading DockForLife...</p>,
})

export default function Home() {
  return <OBSController />
}
