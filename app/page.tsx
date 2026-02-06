import dynamic from "next/dynamic"

const OBSController = dynamic(() => import("@/components/obs-controller").then(mod => mod.OBSController), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-zinc-400">Cargando DockForLife...</span>
      </div>
    </div>
  ),
})

export default function Home() {
  return <OBSController />
}
