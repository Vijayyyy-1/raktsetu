/// <reference types="google.maps" />
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { BellRing, Check, CheckCircle2, Clock3, Pause, Play, Radar, ShieldCheck } from "lucide-react"
import { BLUSH_STYLE, loadGoogleMaps, onMapsAuthFailure } from "@/maps"
import { SPRING } from "@/components/bits"
import { BEATS, CENTER, LOOP_MS, RADIUS_KM, SIM_DONORS, fmtClock, frameAt, plan, type DotState, type Frame, type LatLng, type MapRequest } from "@/story"
import { cn } from "@/lib/utils"

export type { MapRequest } from "@/story"

const DOT: Record<DotState, { color: string; opacity: number; r: number }> = {
  idle: { color: "#e7a8a0", opacity: 0.75, r: 170 },
  faded: { color: "#b9a3a1", opacity: 0.3, r: 130 },
  match: { color: "#E04848", opacity: 1, r: 240 },
  notified: { color: "#E04848", opacity: 1, r: 260 },
  accepted: { color: "#3f8f6f", opacity: 1, r: 300 },
  declined: { color: "#9c8f8e", opacity: 0.55, r: 160 },
}

/** One clock drives the whole story: play, pause, seek, loop. */
function useStoryClock(paused: boolean, onLoop: () => void, start = 0) {
  const [t, setT] = useState(start)
  const tRef = useRef(start)
  const loopRef = useRef(onLoop)
  loopRef.current = onLoop
  useEffect(() => {
    if (paused) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      let next = tRef.current + Math.min(now - last, 100) // cap: tab switches shouldn't skip the story
      last = now
      if (next >= LOOP_MS) (next = 0), loopRef.current()
      tRef.current = next
      setT(next)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [paused])
  const seek = useCallback((ms: number) => ((tRef.current = ms), setT(ms)), [])
  return { t, seek }
}

export function LiveMap({ requests, className }: { requests: MapRequest[]; className?: string }) {
  const reduced = useReducedMotion()
  const [idx, setIdx] = useState(0)
  const [hover, setHover] = useState(false)
  // Dev only: ?storyT=9000 opens the story paused at that moment (for screenshots and rehearsing).
  const devT = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get("storyT")) || 0 : 0
  const [userPaused, setUserPaused] = useState(!!reduced || devT > 0)
  const { t, seek } = useStoryClock(hover || userPaused, () => setIdx((i) => i + 1), devT || (reduced ? BEATS[6].at + 600 : 0))

  const req = requests[idx % requests.length]
  const p = useMemo(() => plan(req), [req])
  const f = useMemo(() => frameAt(t, req, p), [t, req, p])

  return (
    <div className="relative">
      <div
        className={cn("relative overflow-hidden rounded-[32px] bg-[#fbf1ee] shadow-[0_30px_60px_-30px_hsl(0_60%_40%/0.45)]", className)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <MapLayer req={req} f={f} />

        <div className="pointer-events-none absolute inset-x-4 top-4 z-10 flex items-start justify-between gap-2">
          <span className="flex items-center gap-2 rounded-full bg-white/85 px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-blood" /> How it works · simulated
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1.5 font-mono text-xs font-medium tabular-nums shadow-sm backdrop-blur">
            <Clock3 className="h-3.5 w-3.5 text-blood" /> {fmtClock(f.clockSec)}
          </span>
        </div>

        <RequestCard req={req} f={f} />
        <Caption req={req} f={f} />
      </div>

      <Phone req={req} f={f} />
      <StepBar f={f} t={t} paused={hover || userPaused} onSeek={(ms) => seek(ms)} onToggle={() => setUserPaused((v) => !v)} />
      <p className="mt-2 px-1 text-[11px] leading-relaxed text-muted-foreground">
        Donor dots are simulated — real locations are never public. In-app alerts and replies are coming next; today coordinators call matched donors directly.
      </p>
    </div>
  )
}

/* ---------------- overlays ---------------- */

function RequestCard({ req, f }: { req: MapRequest; f: Frame }) {
  const show = f.beatIndex >= 1 && f.beat !== "closed"
  return (
    <AnimatePresence>
      {show && (
        <motion.div key={req.hospital} initial={{ opacity: 0, y: -16, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }} transition={SPRING} className="pointer-events-none absolute left-4 top-14 z-10 flex items-center gap-3 rounded-2xl bg-white/95 p-3 pr-4 shadow-lg backdrop-blur">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[#FF7B72] to-[#C9303F] font-display text-base font-bold text-white">{req.group}</div>
          <div className="text-sm">
            <div className="font-semibold">{req.units} unit{req.units > 1 && "s"} · Critical</div>
            <div className="max-w-[12rem] truncate text-xs text-muted-foreground">{req.hospital}</div>
          </div>
          <AnimatePresence>
            {f.beatIndex >= 2 && (
              <motion.span initial={{ scale: 1.8, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: -6 }} transition={{ type: "spring", stiffness: 500, damping: 18 }} className="ml-1 flex items-center gap-1 rounded-lg border-2 border-ok px-1.5 py-0.5 text-[11px] font-bold uppercase text-ok">
                <ShieldCheck className="h-3 w-3" /> Verified
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Caption({ req, f }: { req: MapRequest; f: Frame }) {
  const c = f.counts
  const content: Record<string, [string, ReactNode, ReactNode]> = {
    calm: ["bg-blood-soft text-blood", <Radar key="i" className="h-5 w-5" />, <><b>{c.total} donors</b> on the registry across Pune</>],
    request: ["bg-blood text-white", <BellRing key="i" className="h-5 w-5" />, <>A request comes in — <b>{req.group}</b> needed at {req.hospital}</>],
    verify: ["bg-emerald-50 text-ok", <ShieldCheck key="i" className="h-5 w-5" />, <>Coordinator calls the hospital — <b>verified</b>, no fake urgency</>],
    match: ["bg-blood-soft text-blood", <Radar key="i" className="h-5 w-5 animate-spin" style={{ animationDuration: "2s" }} />, <Funnel c={c} group={req.group} />],
    notify: ["bg-blood text-white", <BellRing key="i" className="h-5 w-5" />, <><b>{c.near} donors notified</b> · {c.total - c.near} left in peace</>],
    reply: ["bg-ok text-white", <Check key="i" className="h-5 w-5" />, <Units n={f.accepted} of={req.units} declined={f.declined} />],
    closed: ["bg-emerald-50 text-ok", <CheckCircle2 key="i" className="h-5 w-5" />, <>Need met in <b>{fmtClock(f.clockSec)}</b> — pending alerts withdrawn, nothing left to forward</>],
  }
  const [tone, icon, text] = content[f.beat]
  return (
    <div className="pointer-events-none absolute inset-x-4 bottom-4 z-10 md:right-[13.5rem]">
      <AnimatePresence mode="wait">
        <motion.div key={f.beat} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }} className="soft-card flex items-center gap-3 p-3.5">
          <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-2xl", tone)}>{icon}</div>
          <div className="min-w-0 text-sm leading-snug">{text}</div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function Funnel({ c, group }: { c: Frame["counts"]; group: string }) {
  const steps = [
    { n: c.total, l: "donors" },
    { n: c.compat, l: `can give ${group}` },
    { n: c.eligible, l: "eligible" },
    { n: c.near, l: `≤ ${RADIUS_KM} km` },
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      {steps.map((s, i) => (
        <motion.span key={s.l} initial={false} animate={{ opacity: i <= c.shown ? 1 : 0.25 }} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-muted-foreground">→</span>}
          <b className={cn("tabular-nums", i === 3 && i <= c.shown && "text-blood")}>{s.n}</b>
          <span className="text-xs text-muted-foreground">{s.l}</span>
        </motion.span>
      ))}
    </div>
  )
}

function Units({ n, of, declined }: { n: number; of: number; declined: number }) {
  return (
    <div className="w-full">
      <div><b>{n} of {of}</b> donors on the way{declined > 0 && <span className="text-muted-foreground"> · {declined} can't make it</span>}</div>
      <div className="mt-1.5 h-1.5 w-40 overflow-hidden rounded-full bg-muted">
        <motion.div className="h-full rounded-full bg-ok" animate={{ width: `${(Math.min(n, of) / of) * 100}%` }} transition={SPRING} />
      </div>
    </div>
  )
}

/** The donor's phone — the other half of the story. */
function Phone({ req, f }: { req: MapRequest; f: Frame }) {
  const km = f.hero ? `${(Math.hypot((f.hero.lat - req.lat) * 111, (f.hero.lng - req.lng) * 105)).toFixed(1)} km` : ""
  return (
    <div className="pointer-events-none absolute -right-3 top-24 z-20 hidden w-[196px] md:block lg:-right-8" aria-hidden>
      <motion.div animate={f.phone === "ringing" ? { rotate: [0, -3, 3, -2, 2, 0] } : { rotate: 0 }} transition={f.phone === "ringing" ? { duration: 0.6, repeat: Infinity, repeatDelay: 0.8 } : {}} className="rounded-[38px] bg-[#1f1417] p-2 shadow-[0_30px_50px_-20px_rgba(60,10,20,0.6)]">
        <div className="relative h-[372px] overflow-hidden rounded-[31px] bg-gradient-to-b from-[#ffe9e4] via-[#fbd5ce] to-[#f4b7ae] px-3 pt-3">
          <div className="mx-auto h-5 w-20 rounded-full bg-[#1f1417]" />
          <div className="mt-6 text-center font-display text-5xl font-light text-[#3a2228]">9:41</div>
          <div className="text-center text-[11px] text-[#3a2228]/70">{f.hero ? `${f.hero.name}'s phone` : "Donor's phone"}</div>

          <div className="absolute inset-x-2.5 top-[150px]">
            <AnimatePresence mode="wait">
              {f.phone === "idle" && (
                <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-2xl bg-white/50 p-3 text-center text-[11px] text-[#3a2228]/80 backdrop-blur">
                  No alerts. You're on the registry — we'll only ping you when you can really help.
                </motion.div>
              )}
              {(f.phone === "ringing" || f.phone === "pressed") && (
                <motion.div key="ring" initial={{ opacity: 0, y: -30, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={SPRING} className="rounded-2xl bg-white/90 p-3 shadow-lg backdrop-blur">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#3a2228]/60">
                    <span className="grid h-4 w-4 place-items-center rounded bg-blood text-[8px] text-white">🩸</span> RaktSetu · now
                  </div>
                  <div className="mt-1.5 text-[13px] font-semibold leading-snug">{req.group} needed at {req.hospital}</div>
                  <div className="text-[11px] text-muted-foreground">{km} away · verified</div>
                  <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                    <span className="rounded-full bg-muted py-1.5 text-center text-[11px] font-semibold">Can't</span>
                    <motion.span animate={f.phone === "pressed" ? { scale: [1, 0.88, 1.04, 1] } : {}} transition={{ duration: 0.45 }} className={cn("rounded-full py-1.5 text-center text-[11px] font-semibold text-white", f.phone === "pressed" ? "bg-ok" : "bg-blood")}>
                      I can help
                    </motion.span>
                  </div>
                </motion.div>
              )}
              {f.phone === "thanks" && (
                <motion.div key="thanks" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={SPRING} className="rounded-2xl bg-white/90 p-3 text-center shadow-lg">
                  <div className="mx-auto grid h-9 w-9 place-items-center rounded-full bg-ok text-white"><Check className="h-5 w-5" /></div>
                  <div className="mt-2 text-[12px] font-semibold">Thank you!</div>
                  <div className="text-[11px] text-muted-foreground">The coordinator will call you. Head to {req.hospital}.</div>
                </motion.div>
              )}
              {f.phone === "done" && (
                <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-2xl bg-white/70 p-3 text-center text-[11px] backdrop-blur">
                  <b className="text-ok">Need met.</b> This request is closed — no more alerts about it.
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

function StepBar({ f, t, paused, onSeek, onToggle }: { f: Frame; t: number; paused: boolean; onSeek: (ms: number) => void; onToggle: () => void }) {
  const steps = BEATS.slice(1)
  return (
    <div className="mt-4 flex items-center gap-2">
      <button onClick={onToggle} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white shadow-sm transition-colors hover:bg-blood-soft" aria-label={paused ? "Play story" : "Pause story"}>
        {paused ? <Play className="h-4 w-4 text-blood" /> : <Pause className="h-4 w-4 text-blood" />}
      </button>
      <div className="grid flex-1 grid-cols-6 gap-1.5">
        {steps.map((s, i) => {
          const end = steps[i + 1]?.at ?? LOOP_MS
          const k = Math.max(0, Math.min(1, (t - s.at) / (end - s.at)))
          const active = f.beat === s.id
          return (
            <button key={s.id} onClick={() => onSeek(s.at + 1)} className="group text-left" aria-label={`Jump to ${s.label}`}>
              <div className="h-1.5 overflow-hidden rounded-full bg-white shadow-inner">
                <div className="h-full rounded-full bg-blood" style={{ width: `${k * 100}%` }} />
              </div>
              <div className={cn("mt-1.5 truncate text-[11px] font-semibold transition-colors", active ? "text-blood" : "text-muted-foreground group-hover:text-foreground")}>{s.label}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ---------------- map renderers ---------------- */

function MapLayer({ req, f }: { req: MapRequest; f: Frame }) {
  const el = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<"loading" | "ok" | "failed">("loading")
  type Objs = { map: google.maps.Map; dots: google.maps.Circle[]; ripples: google.maps.Circle[]; arcs: google.maps.Polyline[]; ring: google.maps.Circle; pin: google.maps.Circle; pulse: google.maps.Circle }
  const objs = useRef<Objs | null>(null)
  const painted = useRef<string[]>([])

  useEffect(() => {
    let live = true
    loadGoogleMaps()
      .then((gm) => {
        if (!live || !el.current) return
        const map = new gm.Map(el.current, { center: CENTER, zoom: 12, styles: BLUSH_STYLE, disableDefaultUI: true, gestureHandling: "none", keyboardShortcuts: false, clickableIcons: false, backgroundColor: "#fbf1ee" })
        const circle = (o: google.maps.CircleOptions) => new gm.Circle({ map, strokeWeight: 0, clickable: false, ...o })
        objs.current = {
          map,
          dots: SIM_DONORS.map((d) => circle({ center: d, radius: DOT.idle.r, fillColor: DOT.idle.color, fillOpacity: DOT.idle.opacity, zIndex: 3 })),
          ripples: SIM_DONORS.map((d) => circle({ center: d, radius: 0, fillColor: "#E04848", fillOpacity: 0, visible: false, zIndex: 2 })),
          arcs: Array.from({ length: 24 }, () => new gm.Polyline({ map, clickable: false, strokeColor: "#E04848", strokeOpacity: 0.55, strokeWeight: 1.5, visible: false, zIndex: 1 })),
          ring: circle({ center: CENTER, radius: 0, fillColor: "#E04848", fillOpacity: 0.07, strokeColor: "#E04848", strokeOpacity: 0.5, strokeWeight: 2, zIndex: 0 }),
          pulse: circle({ center: CENTER, radius: 0, fillColor: "#2a1b1f", fillOpacity: 0, visible: false, zIndex: 4 }),
          pin: circle({ center: CENTER, radius: 330, fillColor: "#2a1b1f", fillOpacity: 1, zIndex: 5 }),
        }
        setStatus("ok")
      })
      .catch(() => live && setStatus("failed"))
    const unsubscribe = onMapsAuthFailure(() => live && setStatus("failed")) // key refused after load → use the SVG map
    return () => ((live = false), unsubscribe())
  }, [])

  // New request: fly to the hospital.
  useEffect(() => {
    const o = objs.current
    if (status !== "ok" || !o) return
    const at = { lat: req.lat, lng: req.lng }
    o.map.panTo(at)
    o.pin.setCenter(at)
    o.ring.setCenter(at)
    o.pulse.setCenter(at)
    painted.current = []
  }, [status, req])

  // Every frame: only touch what changed.
  useEffect(() => {
    const o = objs.current
    if (status !== "ok" || !o) return
    const hosp = { lat: req.lat, lng: req.lng }
    f.dots.forEach(({ state, pos, ripple }, i) => {
      if (painted.current[i] !== state) {
        const s = DOT[state]
        o.dots[i].setOptions({ fillColor: s.color, fillOpacity: s.opacity, radius: s.r })
        if (state !== "accepted") o.dots[i].setCenter(SIM_DONORS[i])
        painted.current[i] = state
      }
      if (state === "accepted") o.dots[i].setCenter(pos)
      const r = o.ripples[i]
      if (ripple >= 0) r.setOptions({ visible: true, center: pos, radius: 260 + ripple * 1100, fillOpacity: 0.28 * (1 - ripple) })
      else if (r.getVisible()) r.setVisible(false)
    })
    o.ring.setRadius(f.ringKm * 1000)
    if (f.pinPulse >= 0) o.pulse.setOptions({ visible: true, radius: 330 + f.pinPulse * 1400, fillOpacity: 0.25 * (1 - f.pinPulse) })
    else if (o.pulse.getVisible()) o.pulse.setVisible(false)
    o.arcs.forEach((line, i) => {
      const a = f.arcs[i]
      if (a) line.setOptions({ visible: true, path: [hosp, lerp(hosp, a.to, a.k)] })
      else if (line.getVisible()) line.setVisible(false)
    })
  }, [status, f, req])

  return (
    <>
      <div ref={el} className={cn("absolute inset-0 transition-opacity duration-700", status === "ok" ? "opacity-100" : "pointer-events-none invisible opacity-0")} aria-hidden />
      {status === "failed" && <SvgMap req={req} f={f} />}
      {status === "loading" && <div className="absolute inset-0 animate-pulse bg-[#f8e9e5]" />}
    </>
  )
}

const lerp = (a: LatLng, b: LatLng, k: number): LatLng => ({ lat: a.lat + (b.lat - a.lat) * k, lng: a.lng + (b.lng - a.lng) * k })

/** Same story without Google: drawn as SVG, so the demo never depends on the network. */
function SvgMap({ req, f }: { req: MapRequest; f: Frame }) {
  const kmX = 111 * Math.cos((CENTER.lat * Math.PI) / 180)
  const S = 30 // px per km
  const px = (p: LatLng) => ({ x: 400 + (p.lng - CENTER.lng) * kmX * S, y: 300 - (p.lat - CENTER.lat) * 111 * S })
  const h = px(req)
  return (
    <svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" role="img" aria-label="Simulated donors responding to a blood request">
      {[100, 200, 300].map((r) => <circle key={r} cx={400} cy={300} r={r} fill="none" stroke="#f1d2cc" strokeDasharray="3 6" />)}
      <circle cx={h.x} cy={h.y} r={f.ringKm * S} fill="#E04848" fillOpacity={0.07} stroke="#E04848" strokeOpacity={0.5} strokeWidth={2} />
      {f.arcs.map((a, i) => { const e = px(lerp(req, a.to, a.k)); return <line key={i} x1={h.x} y1={h.y} x2={e.x} y2={e.y} stroke="#E04848" strokeOpacity={0.5} strokeWidth={1.5} /> })}
      {f.dots.map(({ d, state, pos, ripple }) => {
        const p = px(pos), s = DOT[state]
        return (
          <g key={d.id}>
            {ripple >= 0 && <circle cx={p.x} cy={p.y} r={8 + ripple * 30} fill="#E04848" fillOpacity={0.28 * (1 - ripple)} />}
            <circle cx={p.x} cy={p.y} r={s.r / 40} fill={s.color} opacity={s.opacity} />
          </g>
        )
      })}
      {f.pinPulse >= 0 && <circle cx={h.x} cy={h.y} r={9 + f.pinPulse * 40} fill="#2a1b1f" fillOpacity={0.25 * (1 - f.pinPulse)} />}
      <circle cx={h.x} cy={h.y} r={9} fill="#2a1b1f" />
    </svg>
  )
}

