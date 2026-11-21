// The landing-page story: one request, from arrival to "need met", as a pure function of time.
// Renderers (Google map, SVG fallback, phone, captions) all read the same Frame, so they stay in sync.
import { distanceKm } from "@/api"
import { CAN_RECEIVE, GROUPS, type Group } from "@/data"

export type MapRequest = { group: Group; hospital: string; lat: number; lng: number; units: number }
export type LatLng = { lat: number; lng: number }

export const CENTER: LatLng = { lat: 18.5204, lng: 73.8567 } // Pune
export const RADIUS_KM = 5

// shortcut: donor dots are simulated on purpose — real donor locations must never be public.
export type SimDonor = LatLng & { id: number; group: Group; eligible: boolean; name: string }
const NAMES = ["Anaya", "Rohan", "Meera", "Kabir", "Ishita", "Aarav", "Diya", "Omkar", "Sneha", "Arjun", "Tanvi", "Yash"]
export const SIM_DONORS: SimDonor[] = (() => {
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  const weights: [Group, number][] = [["O+", 32], ["B+", 30], ["A+", 22], ["AB+", 8], ["O-", 2], ["B-", 2], ["A-", 2], ["AB-", 2]]
  return Array.from({ length: 64 }, (_, id) => {
    const r = Math.sqrt(rand()) * 11, a = rand() * Math.PI * 2
    let w = rand() * 100
    const group = weights.find(([, p]) => (w -= p) < 0)?.[0] ?? "O+"
    return {
      id, group, eligible: rand() > 0.25, name: NAMES[id % NAMES.length],
      lat: CENTER.lat + (r / 111) * Math.sin(a),
      lng: CENTER.lng + (r / (111 * Math.cos((CENTER.lat * Math.PI) / 180))) * Math.cos(a),
    }
  })
})()

/* ---------- timeline (ms) ---------- */
export type Beat = "calm" | "request" | "verify" | "match" | "notify" | "reply" | "closed"
export const BEATS: { id: Beat; at: number; label: string }[] = [
  { id: "calm", at: 0, label: "Registry" },
  { id: "request", at: 900, label: "Request" },
  { id: "verify", at: 2400, label: "Verify" },
  { id: "match", at: 3600, label: "Match" },
  { id: "notify", at: 6600, label: "Notify" },
  { id: "reply", at: 8400, label: "Reply" },
  { id: "closed", at: 11800, label: "Closed" },
]
export const LOOP_MS = 14800
const FILTER_AT = { compat: 3700, eligible: 4500, radius: 5300 }
const RING = { growAt: 3700, growMs: 1300, collapseAt: 12000, collapseMs: 700 }
const REPLY_AT = [8700, 9300, 10000] // nearest: accepts · 2nd: declines · 3rd: accepts (if 2+ units)
const TRAVEL_MS = 2600
// Story clock shown on screen: real elapsed minutes don't fit in 15 s, so map ms → story seconds.
const CLOCK: [number, number][] = [[0, 0], [900, 0], [2400, 25], [3600, 40], [6600, 48], [8400, 110], [10000, 240], [11800, 372], [LOOP_MS, 372]]

export type DotState = "idle" | "faded" | "match" | "notified" | "accepted" | "declined"
export type Frame = {
  beat: Beat
  beatIndex: number
  dots: { d: SimDonor; state: DotState; pos: LatLng; ripple: number }[] // ripple: 0..1 phase, -1 = none
  ringKm: number
  arcs: { to: LatLng; k: number }[]
  pinPulse: number // -1 = none
  clockSec: number
  counts: { total: number; compat: number; eligible: number; near: number; shown: number } // shown = funnel steps revealed (0-3)
  accepted: number
  declined: number
  phone: "idle" | "ringing" | "pressed" | "thanks" | "done"
  hero: SimDonor | null
}

const clamp = (x: number) => Math.max(0, Math.min(1, x))
const ease = (x: number) => 1 - Math.pow(1 - clamp(x), 3)
const lerp = (a: LatLng, b: LatLng, k: number): LatLng => ({ lat: a.lat + (b.lat - a.lat) * k, lng: a.lng + (b.lng - a.lng) * k })
const interp = (pts: [number, number][], t: number) => {
  for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) return pts[i - 1][1] + ((pts[i][1] - pts[i - 1][1]) * (t - pts[i - 1][0])) / (pts[i][0] - pts[i - 1][0] || 1)
  return pts[pts.length - 1][1]
}

/** Who passes each filter for a request — same rules as the API (compatible group, eligible, within radius). */
export function plan(req: MapRequest) {
  const withKm = SIM_DONORS.map((d) => ({ d, km: distanceKm(req.lat, req.lng, d.lat, d.lng) }))
  const compat = new Set(withKm.filter((x) => CAN_RECEIVE[req.group].includes(x.d.group)).map((x) => x.d.id))
  const eligible = new Set([...compat].filter((id) => SIM_DONORS[id].eligible))
  const near = withKm.filter((x) => eligible.has(x.d.id) && x.km <= RADIUS_KM).sort((a, b) => a.km - b.km).map((x) => x.d)
  const replies = new Map<number, { kind: "accepted" | "declined"; at: number }>()
  if (near[0]) replies.set(near[0].id, { kind: "accepted", at: REPLY_AT[0] })
  if (near[1]) replies.set(near[1].id, { kind: "declined", at: REPLY_AT[1] })
  if (near[2] && req.units >= 2) replies.set(near[2].id, { kind: "accepted", at: REPLY_AT[2] })
  return { compat, eligible, near, nearIds: new Set(near.map((d) => d.id)), replies, hero: near[0] ?? null }
}
export type Plan = ReturnType<typeof plan>

export function frameAt(t: number, req: MapRequest, p: Plan): Frame {
  const beatIndex = BEATS.reduce((i, b, j) => (t >= b.at ? j : i), 0)
  const beat = BEATS[beatIndex].id
  const hosp = { lat: req.lat, lng: req.lng }
  const closed = t >= BEATS[6].at

  const dots = SIM_DONORS.map((d) => {
    let state: DotState = "idle"
    let pos: LatLng = d
    let ripple = -1
    if (t >= FILTER_AT.compat && !closed) {
      state = "match"
      if (!p.compat.has(d.id)) state = "faded"
      else if (t >= FILTER_AT.eligible && !p.eligible.has(d.id)) state = "faded"
      else if (t >= FILTER_AT.radius && !p.nearIds.has(d.id)) state = "faded"
      if (state === "match" && t >= BEATS[4].at) {
        state = "notified"
        ripple = ((t - BEATS[4].at) % 1400) / 1400
      }
    }
    const reply = p.replies.get(d.id)
    if (reply && t >= reply.at) {
      state = reply.kind
      ripple = -1
      if (reply.kind === "accepted") pos = lerp(d, hosp, 0.88 * ease((t - reply.at - 200) / TRAVEL_MS))
    }
    if (closed && reply?.kind !== "accepted") (state = "idle"), (ripple = -1) // pending alerts withdrawn
    return { d, state, pos, ripple }
  })

  const ringKm = t < RING.growAt ? 0 : t < RING.collapseAt ? RADIUS_KM * ease((t - RING.growAt) / RING.growMs) : RADIUS_KM * (1 - ease((t - RING.collapseAt) / RING.collapseMs))
  const arcs = t >= BEATS[4].at && !closed
    ? p.near
        .map((d, i) => ({ d, k: ease((t - BEATS[4].at - i * 110) / 650) }))
        .filter(({ d, k }) => k > 0 && !(t >= (p.replies.get(d.id)?.at ?? Infinity))) // keep arcs only to donors still deciding
        .map(({ d, k }) => ({ to: d as LatLng, k }))
    : []
  const accepted = [...p.replies.values()].filter((r) => r.kind === "accepted" && t >= r.at).length
  const declined = [...p.replies.values()].filter((r) => r.kind === "declined" && t >= r.at).length
  const shown = t < FILTER_AT.compat ? 0 : t < FILTER_AT.eligible ? 1 : t < FILTER_AT.radius ? 2 : 3
  const heroAt = p.hero ? p.replies.get(p.hero.id)!.at : Infinity
  const phone: Frame["phone"] = closed ? "done" : t >= heroAt + 250 ? "thanks" : t >= heroAt - 450 ? "pressed" : t >= BEATS[4].at + 300 ? "ringing" : "idle"

  return {
    beat, beatIndex, dots, ringKm, arcs,
    pinPulse: t >= BEATS[1].at && t < BEATS[3].at ? ((t - BEATS[1].at) % 1200) / 1200 : -1,
    clockSec: interp(CLOCK, t),
    counts: { total: SIM_DONORS.length, compat: p.compat.size, eligible: p.eligible.size, near: p.near.length, shown },
    accepted, declined, phone, hero: p.hero,
  }
}

export const fmtClock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`

// Self-checks: the story must be internally consistent for every blood group.
if (import.meta.env.DEV) {
  console.assert(SIM_DONORS.every((d) => GROUPS.includes(d.group)), "simulated donor has unknown group")
  console.assert(BEATS.every((b, i) => i === 0 || b.at > BEATS[i - 1].at) && BEATS[6].at < LOOP_MS, "beats out of order")
  for (const g of GROUPS) {
    const p = plan({ group: g, units: 2, hospital: "x", lat: CENTER.lat, lng: CENTER.lng })
    console.assert(p.near.every((d) => p.eligible.has(d.id) && p.compat.has(d.id)), `funnel broken for ${g}`)
    const end = frameAt(LOOP_MS - 1, { group: g, units: 2, hospital: "x", ...CENTER }, p)
    console.assert(end.dots.every((x) => x.state === "idle" || x.state === "accepted"), `pending alerts not withdrawn for ${g}`)
  }
}
