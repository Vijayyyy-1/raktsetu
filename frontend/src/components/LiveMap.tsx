/// <reference types="google.maps" />
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { BellRing, Check, CheckCircle2, Radar } from "lucide-react"
import { distanceKm } from "@/api"
import { CAN_RECEIVE, GROUPS, type Group } from "@/data"
import { BLUSH_STYLE, loadGoogleMaps } from "@/maps"
import { SPRING } from "@/components/bits"
import { cn } from "@/lib/utils"

export type MapRequest = { group: Group; hospital: string; lat: number; lng: number; units: number }

const CENTER = { lat: 18.5204, lng: 73.8567 } // Pune
const RADIUS_KM = 5

// shortcut: donor dots are simulated on purpose — real donor locations must never be public.
type SimDonor = { id: number; lat: number; lng: number; group: Group; eligible: boolean }
const SIM_DONORS: SimDonor[] = (() => {
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  const weights: [Group, number][] = [["O+", 32], ["B+", 30], ["A+", 22], ["AB+", 8], ["O-", 2], ["B-", 2], ["A-", 2], ["AB-", 2]]
  return Array.from({ length: 64 }, (_, id) => {
    const r = Math.sqrt(rand()) * 11, a = rand() * Math.PI * 2
    let w = rand() * 100
    const group = weights.find(([, p]) => (w -= p) < 0)?.[0] ?? "O+"
    return { id, group, eligible: rand() > 0.25, lat: CENTER.lat + (r / 111) * Math.sin(a), lng: CENTER.lng + (r / (111 * Math.cos((CENTER.lat * Math.PI) / 180))) * Math.cos(a) }
  })
})()

type Phase = "idle" | "search" | "match" | "alert" | "accepted" | "closed"
// When each phase starts (ms) in one loop for a single request.
const TIMELINE: [Phase, number][] = [["idle", 0], ["search", 700], ["match", 2100], ["alert", 3100], ["accepted", 5200], ["closed", 7000]]
const LOOP_MS = 9200

export function LiveMap({ requests, className }: { requests: MapRequest[]; className?: string }) {
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<Phase>("idle")
  const req = requests[idx % requests.length]

  // Who matches this request (same rules as the API: compatible group, eligible, within radius).
  const sim = useMemo(() => {
    const withKm = SIM_DONORS.map((d) => ({ ...d, km: distanceKm(req.lat, req.lng, d.lat, d.lng) }))
    const matches = withKm.filter((d) => d.km <= RADIUS_KM && d.eligible && CAN_RECEIVE[req.group].includes(d.group)).sort((a, b) => a.km - b.km)
    return { withKm, matchIds: new Set(matches.map((d) => d.id)), acceptedIds: new Set(matches.slice(0, Math.min(req.units, matches.length)).map((d) => d.id)), matches: matches.length }
  }, [req])

  useEffect(() => {
    const timers = TIMELINE.map(([p, at]) => setTimeout(() => setPhase(p), at))
    timers.push(setTimeout(() => setIdx((i) => i + 1), LOOP_MS))
    return () => timers.forEach(clearTimeout)
  }, [idx])

  const state = (d: SimDonor): DotState => {
    const after = (p: Phase) => TIMELINE.findIndex(([x]) => x === phase) >= TIMELINE.findIndex(([x]) => x === p)
    if (!after("match") || phase === "closed") return "idle"
    if (after("accepted") && sim.acceptedIds.has(d.id)) return "accepted"
    return sim.matchIds.has(d.id) ? "match" : "faded"
  }

  return (
    <div className={cn("relative overflow-hidden rounded-[32px] bg-[#fbf1ee] shadow-[0_30px_60px_-30px_hsl(0_60%_40%/0.45)]", className)}>
      <GoogleLayer req={req} phase={phase} state={state} />

      <div className="pointer-events-none absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full bg-white/85 px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur">
        <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blood opacity-60" /><span className="relative h-2 w-2 rounded-full bg-blood" /></span>
        Live simulation · Pune
      </div>

      <div className="pointer-events-none absolute right-4 top-4 z-10 hidden gap-3 rounded-full bg-white/85 px-3 py-1.5 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur sm:flex">
        <Legend c="bg-[#e7a8a0]" t="Donor" /><Legend c="bg-blood" t="Match" /><Legend c="bg-ok" t="On the way" />
      </div>

      <div className="pointer-events-none absolute inset-x-4 bottom-4 z-10">
        <AnimatePresence mode="wait">
          <motion.div key={`${idx}-${phase}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={SPRING} className="soft-card flex items-center gap-3 p-4">
            <PhaseIcon phase={phase} />
            <div className="min-w-0 text-sm">
              <div className="truncate font-semibold">{req.group} needed at {req.hospital}</div>
              <div className="text-muted-foreground">{caption(phase, sim.matches, SIM_DONORS.length)}</div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

type DotState = "idle" | "match" | "faded" | "accepted"
const DOT: Record<DotState, { color: string; opacity: number; r: number }> = {
  idle: { color: "#e7a8a0", opacity: 0.75, r: 170 },
  faded: { color: "#b9a3a1", opacity: 0.35, r: 130 },
  match: { color: "#E04848", opacity: 1, r: 260 },
  accepted: { color: "#3f8f6f", opacity: 1, r: 300 },
}

function caption(p: Phase, matches: number, total: number) {
  switch (p) {
    case "idle": return "Request verified by a coordinator"
    case "search": return `Searching ${RADIUS_KM} km around the hospital…`
    case "match": return `${matches} of ${total} donors match · ${total - matches} left in peace`
    case "alert": return `Alert sent to ${matches} donors — nobody else is disturbed`
    case "accepted": return "Donors on the way 🩸"
    case "closed": return "Need met — request closed. No stale forwards."
  }
}

function PhaseIcon({ phase }: { phase: Phase }) {
  const map: Record<Phase, [string, ReactNode]> = {
    idle: ["bg-emerald-50 text-ok", <Check key="i" className="h-5 w-5" />],
    search: ["bg-blood-soft text-blood", <Radar key="s" className="h-5 w-5 animate-spin" style={{ animationDuration: "2s" }} />],
    match: ["bg-blood text-white", <span key="m" className="font-display text-sm font-bold">✓</span>],
    alert: ["bg-blood text-white", <BellRing key="a" className="h-5 w-5" />],
    accepted: ["bg-ok text-white", <Check key="c" className="h-5 w-5" />],
    closed: ["bg-emerald-50 text-ok", <CheckCircle2 key="d" className="h-5 w-5" />],
  }
  const [tone, icon] = map[phase]
  return <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", tone)}>{icon}</div>
}

const Legend = ({ c, t }: { c: string; t: string }) => <span className="flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", c)} />{t}</span>

/** Google map with donor dots + spreading ring; falls back to an SVG drawing if the map can't load. */
function GoogleLayer({ req, phase, state }: { req: MapRequest; phase: Phase; state: (d: SimDonor) => DotState }) {
  const el = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<"loading" | "ok" | "failed">("loading")
  const objs = useRef<{ map?: google.maps.Map; dots: google.maps.Circle[]; ring?: google.maps.Circle; pin?: google.maps.Circle }>({ dots: [] })

  useEffect(() => {
    let live = true
    loadGoogleMaps()
      .then((gm) => {
        if (!live || !el.current) return
        const map = new gm.Map(el.current, { center: CENTER, zoom: 12, styles: BLUSH_STYLE, disableDefaultUI: true, gestureHandling: "none", keyboardShortcuts: false, clickableIcons: false, backgroundColor: "#fbf1ee" })
        const circle = (o: google.maps.CircleOptions) => new gm.Circle({ map, strokeWeight: 0, clickable: false, ...o })
        objs.current = {
          map,
          dots: SIM_DONORS.map((d) => circle({ center: d, radius: DOT.idle.r, fillColor: DOT.idle.color, fillOpacity: DOT.idle.opacity })),
          ring: circle({ center: CENTER, radius: 0, fillColor: "#E04848", fillOpacity: 0.08, strokeColor: "#E04848", strokeOpacity: 0.5, strokeWeight: 2 }),
          pin: circle({ center: CENTER, radius: 320, fillColor: "#2a1b1f", fillOpacity: 1, zIndex: 10 }),
        }
        setStatus("ok")
      })
      .catch(() => live && setStatus("failed"))
    return () => void (live = false)
  }, [])

  // Paint dots for the current phase.
  useEffect(() => {
    if (status !== "ok") return
    objs.current.dots.forEach((c, i) => {
      const s = DOT[state(SIM_DONORS[i])]
      c.setOptions({ fillColor: s.color, fillOpacity: s.opacity, radius: s.r })
    })
  }, [status, phase, state])

  // Move to the request and animate the search ring.
  useEffect(() => {
    const { map, ring, pin } = objs.current
    if (status !== "ok" || !map || !ring || !pin) return
    const at = { lat: req.lat, lng: req.lng }
    if (phase === "idle") (map.panTo(at), pin.setCenter(at), ring.setCenter(at), ring.setRadius(0), ring.setOptions({ fillOpacity: 0.08, strokeOpacity: 0.5 }))
    if (phase === "closed") ring.setOptions({ fillOpacity: 0, strokeOpacity: 0 })
    if (phase !== "search") return
    let raf = 0
    const t0 = performance.now()
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 1300)
      ring.setRadius(RADIUS_KM * 1000 * (1 - Math.pow(1 - k, 3)))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [status, phase, req])

  return (
    <>
      <div ref={el} className={cn("absolute inset-0 transition-opacity duration-700", status === "ok" ? "opacity-100" : "opacity-0")} aria-hidden />
      {status === "failed" && <SvgFallback req={req} phase={phase} state={state} />}
      {status === "loading" && <div className="absolute inset-0 animate-pulse bg-[#f8e9e5]" />}
    </>
  )
}

/** Same simulation drawn as SVG (no network needed). */
function SvgFallback({ req, phase, state }: { req: MapRequest; phase: Phase; state: (d: SimDonor) => DotState }) {
  const kmX = 111 * Math.cos((CENTER.lat * Math.PI) / 180)
  const px = (lat: number, lng: number) => ({ x: 400 + (lng - CENTER.lng) * kmX * 30, y: 300 - (lat - CENTER.lat) * 111 * 30 })
  const c = px(req.lat, req.lng)
  const showRing = phase !== "idle" && phase !== "closed"
  return (
    <svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" role="img" aria-label="Simulated donors around the hospital">
      {[100, 200, 300].map((r) => <circle key={r} cx={400} cy={300} r={r} fill="none" stroke="#f1d2cc" strokeDasharray="3 6" />)}
      <motion.circle cx={c.x} cy={c.y} fill="#E04848" fillOpacity={0.08} stroke="#E04848" strokeOpacity={0.5} strokeWidth={2} animate={{ r: showRing ? RADIUS_KM * 30 : 0 }} transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1] }} />
      {SIM_DONORS.map((d) => {
        const p = px(d.lat, d.lng), s = DOT[state(d)]
        return <motion.circle key={d.id} cx={p.x} cy={p.y} animate={{ r: s.r / 40, fill: s.color, opacity: s.opacity }} transition={SPRING} />
      })}
      <circle cx={c.x} cy={c.y} r={8} fill="#2a1b1f" />
    </svg>
  )
}

// Self-check: demo groups must all be known groups.
if (import.meta.env.DEV) console.assert(SIM_DONORS.every((d) => GROUPS.includes(d.group)), "simulated donor has unknown group")
