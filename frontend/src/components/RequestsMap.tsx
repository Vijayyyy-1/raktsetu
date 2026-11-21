/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react"
import { ArrowRight, Building2, Loader2, MapPinOff } from "lucide-react"
import { BLUSH_STYLE, loadGoogleMaps } from "@/maps"
import { BloodChip, Btn, UrgencyTag, VerifiedTag } from "@/components/bits"
import { requestLabel, type LiveRequest, type Supply } from "@/api"
import { CENTER } from "@/story"

const PIN: Record<LiveRequest["urgency"], string> = { critical: "#C9303F", urgent: "#E04848", planned: "#e7a8a0" }
// Ring tint mirrors the card's coverage line: red = nobody within 25 km, amber = thin within 10 km.
const ring = (s?: Supply) => (!s ? "#b9a3a1" : s.within25 === 0 ? "#C9303F" : s.within10 < 2 ? "#d97706" : "#3f8f6f")

/** Open requests on a map. Donor locations are deliberately not plotted; coverage shows as a 10 km ring per request. */
export function RequestsMap({ requests, supply, onMatch }: { requests: LiveRequest[]; supply: Record<number, Supply>; onMatch?: (id: number) => void }) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<google.maps.Map | null>(null)
  const drawn = useRef<(google.maps.Marker | google.maps.Circle)[]>([])
  const [status, setStatus] = useState<"loading" | "ok" | "failed">("loading")
  const [picked, setPicked] = useState<number | null>(null)

  useEffect(() => {
    let live = true
    loadGoogleMaps()
      .then((gm) => {
        if (!live || !el.current) return
        map.current = new gm.Map(el.current, { center: CENTER, zoom: 12, styles: BLUSH_STYLE, disableDefaultUI: true, zoomControl: true, clickableIcons: false, backgroundColor: "#fbf1ee" })
        setStatus("ok")
      })
      .catch(() => live && setStatus("failed"))
    return () => void (live = false)
  }, [])

  // The parent re-renders every second (countdowns) with a fresh array, so redraw only when what's drawn actually changes,
  // and re-fit the view only when the set of requests changes — otherwise the coordinator's pan/zoom snaps back.
  const latest = useRef({ requests, supply })
  latest.current = { requests, supply }
  const drawKey = requests.map((r) => `${r.id}:${r.lat},${r.lng}:${r.group}:${r.urgency}:${ring(supply[r.id])}`).join("|")
  const idsKey = requests.map((r) => r.id).sort((a, b) => a - b).join()

  useEffect(() => {
    const m = map.current
    if (status !== "ok" || !m) return
    const { requests, supply } = latest.current
    drawn.current.forEach((o) => o.setMap(null))
    drawn.current = requests.flatMap((r) => {
      const at = { lat: r.lat, lng: r.lng }
      const marker = new google.maps.Marker({
        map: m, position: at, title: `${r.group} · ${r.hospital}`, zIndex: r.urgency === "critical" ? 3 : 2,
        label: { text: r.group, color: "#fff", fontWeight: "700", fontSize: "12px" },
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 17, fillColor: PIN[r.urgency], fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3 },
      })
      marker.addListener("click", () => setPicked(r.id))
      const coverage = new google.maps.Circle({ map: m, center: at, radius: 10_000, clickable: false, fillColor: ring(supply[r.id]), fillOpacity: 0.08, strokeColor: ring(supply[r.id]), strokeOpacity: 0.5, strokeWeight: 1.5 })
      return [marker, coverage]
    })
  }, [status, drawKey])

  useEffect(() => {
    const m = map.current
    const { requests } = latest.current
    if (status !== "ok" || !m || !requests.length) return
    const b = new google.maps.LatLngBounds()
    requests.forEach((r) => b.extend({ lat: r.lat, lng: r.lng }))
    requests.length === 1 ? (m.setCenter(b.getCenter()), m.setZoom(12)) : m.fitBounds(b, 80)
  }, [status, idsKey])

  const sel = requests.find((r) => r.id === picked)
  const s = sel && supply[sel.id]

  return (
    <div className="relative h-[520px] overflow-hidden rounded-[28px] bg-[#fbf1ee] shadow-[0_30px_60px_-30px_hsl(0_60%_40%/0.45)]">
      <div ref={el} className="absolute inset-0" />
      {status !== "ok" && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted-foreground">
          {status === "loading" ? <Loader2 className="h-6 w-6 animate-spin text-blood" /> : (
            <div><MapPinOff className="mx-auto mb-2 h-6 w-6 text-blood" />Map unavailable — check VITE_GOOGLE_MAPS_API_KEY. The card view still works.</div>
          )}
        </div>
      )}
      {status === "ok" && (
        <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap gap-2 text-xs font-medium">
          {[["#3f8f6f", "2+ donors in 10 km"], ["#d97706", "thin coverage"], ["#C9303F", "none in 25 km"]].map(([c, l]) => (
            <span key={l} className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 shadow-sm backdrop-blur"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />{l}</span>
          ))}
        </div>
      )}
      {sel && (
        <div className="absolute inset-x-4 bottom-4 flex flex-wrap items-center gap-4 rounded-2xl bg-white/95 p-4 shadow-xl backdrop-blur sm:left-auto sm:w-[380px]">
          <BloodChip group={sel.group} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 truncate font-semibold"><Building2 className="h-3.5 w-3.5 text-blood/70" />{sel.hospital}</div>
            <div className="text-xs text-muted-foreground">{requestLabel(sel.id)} · {sel.units} units{s ? ` · ${s.within10} donors within 10 km` : ""}</div>
            <div className="mt-1.5 flex gap-1.5"><UrgencyTag u={sel.urgency} /><VerifiedTag verified={sel.verified} /></div>
          </div>
          {sel.verified && (
            <Btn className="group h-9 px-3 text-xs" onClick={() => onMatch?.(sel.id)}>Find donors <ArrowRight className="h-3.5 w-3.5" /></Btn>
          )}
          <button onClick={() => setPicked(null)} className="absolute right-3 top-2 text-lg leading-none text-muted-foreground hover:text-foreground" aria-label="Close">×</button>
        </div>
      )}
    </div>
  )
}
