/// <reference types="google.maps" />
import { useEffect, useRef, useState, type ReactNode } from "react"
import { Loader2 } from "lucide-react"
import { BLUSH_STYLE, loadGoogleMaps } from "@/maps"
import type { Match, OutreachStatus } from "@/api"

// Dot colour by outreach status; "none" = matched but not contacted yet.
export const DOT: Record<OutreachStatus | "none", { color: string; label: string }> = {
  none: { color: "#E04848", label: "Not contacted" },
  responded: { color: "#d97706", label: "Raised hand" },
  called: { color: "#9a8487", label: "Called" },
  no_answer: { color: "#e7a8a0", label: "No answer" },
  coming: { color: "#2563eb", label: "Coming" },
  donated: { color: "#3f8f6f", label: "Donated" },
  declined: { color: "#c9bdbb", label: "Declined" },
  unavailable: { color: "#c9bdbb", label: "Committed elsewhere" },
}

/**
 * Hospital, search radius and matched donors on a real map. Donor positions come from the API already rounded
 * to ~1 km; names only show as a hover tooltip. Renders `fallback` if Google Maps can't load.
 */
export function DonorsMap({ at, radiusKm, donors, status, focus, onFocus, fallback }: {
  at: { lat: number; lng: number }
  radiusKm: number
  donors: Match[]
  status: Record<number, OutreachStatus>
  focus: number | null
  onFocus: (id: number | null) => void
  fallback: ReactNode
}) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<google.maps.Map | null>(null)
  const ring = useRef<google.maps.Circle | null>(null)
  const dots = useRef(new Map<number, google.maps.Marker>())
  const [state, setState] = useState<"loading" | "ok" | "failed">("loading")

  useEffect(() => {
    let live = true
    loadGoogleMaps()
      .then((gm) => {
        if (!live || !el.current) return
        const m = new gm.Map(el.current, { center: at, zoom: 13, styles: BLUSH_STYLE, disableDefaultUI: true, zoomControl: true, clickableIcons: false, backgroundColor: "#fbf1ee", isFractionalZoomEnabled: true })
        ring.current = new gm.Circle({ map: m, center: at, radius: radiusKm * 1000, clickable: false, fillColor: "#E04848", fillOpacity: 0.06, strokeColor: "#E04848", strokeOpacity: 0.45, strokeWeight: 1.5 })
        new gm.Marker({ map: m, position: at, title: "Hospital", zIndex: 10, icon: { path: gm.SymbolPath.CIRCLE, scale: 9, fillColor: "#2a1b1f", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3 } })
        map.current = m
        setState("ok")
      })
      .catch(() => live && setState("failed"))
    return () => void (live = false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- map is created once per request screen
  }, [])

  // Radius follows the slider; the view frames the whole search area.
  useEffect(() => {
    if (state !== "ok" || !ring.current || !map.current) return
    ring.current.setRadius(radiusKm * 1000)
    const b = ring.current.getBounds()
    if (b) map.current.fitBounds(b, 24)
  }, [state, radiusKm])

  // Donor dots: rebuilt when the list changes, recoloured when statuses change.
  useEffect(() => {
    const m = map.current
    if (state !== "ok" || !m) return
    dots.current.forEach((d) => d.setMap(null))
    dots.current = new Map(donors.map((d) => {
      const marker = new google.maps.Marker({ map: m, position: { lat: d.lat, lng: d.lng }, title: `${d.name} · ${d.group} · ${d.km} km` })
      marker.addListener("click", () => onFocus(d.donorId))
      return [d.donorId, marker]
    }))
    // onFocus is a stable state setter from the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, donors])

  // Positions arrive rounded to ~1 km, so neighbours often share a point and hide each other.
  // Fan co-located dots onto a small ring; its size tracks the search radius so they stay apart at any zoom.
  useEffect(() => {
    const groups = new Map<string, Match[]>()
    donors.forEach((d) => groups.set(`${d.lat},${d.lng}`, [...(groups.get(`${d.lat},${d.lng}`) ?? []), d]))
    const spreadM = radiusKm * 70
    groups.forEach((g) => g.forEach((d, i) => {
      const a = (2 * Math.PI * i) / g.length - Math.PI / 2
      const r = g.length > 1 ? spreadM : 0
      dots.current.get(d.donorId)?.setPosition({
        lat: d.lat + (r * Math.sin(a)) / 111_320,
        lng: d.lng + (r * Math.cos(a)) / (111_320 * Math.cos((d.lat * Math.PI) / 180)),
      })
    }))
  }, [state, donors, radiusKm])

  useEffect(() => {
    dots.current.forEach((marker, id) => {
      const on = id === focus
      marker.setIcon({ path: google.maps.SymbolPath.CIRCLE, scale: on ? 11 : 7, fillColor: DOT[status[id] ?? "none"].color, fillOpacity: 1, strokeColor: on ? "#2a1b1f" : "#fff", strokeWeight: on ? 3 : 2 })
      marker.setZIndex(on ? 20 : 5)
    })
  }, [state, donors, status, focus])

  if (state === "failed") return <>{fallback}</>

  const used = new Set<OutreachStatus | "none">(donors.map((d) => status[d.donorId] ?? "none"))
  return (
    <div className="my-4">
      <div className="relative h-[300px] overflow-hidden rounded-2xl bg-[#fbf1ee]">
        <div ref={el} className="absolute inset-0" />
        {state === "loading" && <div className="absolute inset-0 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-blood" /></div>}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 px-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#2a1b1f]" />Hospital</span>
        {(Object.keys(DOT) as (keyof typeof DOT)[]).filter((k) => used.has(k)).map((k) => (
          <span key={k} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: DOT[k].color }} />{DOT[k].label}</span>
        ))}
      </div>
    </div>
  )
}
