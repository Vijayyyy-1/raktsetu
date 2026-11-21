// Thin client for the NestJS API. Converts API enums (B_POSITIVE, CRITICAL…) to UI values (B+, critical…) at this boundary only.
import { GROUPS, type Group, type RequestStatus, type Urgency } from "@/data"

const BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/v1"

// Token lives in memory only (as the API docs recommend); a page refresh signs out.
let token: string | null = null
let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn)
export const clearToken = () => (token = null)

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = res.status === 204 ? null : await res.json().catch(() => null)
  if (res.status === 401 && token) (token = null), onUnauthorized()
  if (!res.ok) {
    const msg = data?.message
    throw Object.assign(new Error(Array.isArray(msg) ? msg.join(", ") : msg || `Request failed (${res.status})`), { status: res.status })
  }
  return data as T
}

/* ---------- enum mapping ---------- */
type ApiGroup = "A_POSITIVE" | "A_NEGATIVE" | "B_POSITIVE" | "B_NEGATIVE" | "AB_POSITIVE" | "AB_NEGATIVE" | "O_POSITIVE" | "O_NEGATIVE"
export const toGroup = (g: ApiGroup): Group => (g.replace("_POSITIVE", "+").replace("_NEGATIVE", "-") as Group)
export const fromGroup = (g: Group): ApiGroup => (g.replace("+", "_POSITIVE").replace("-", "_NEGATIVE") as ApiGroup)
const URG = { ROUTINE: "planned", URGENT: "urgent", CRITICAL: "critical" } as const
const fromUrgency = (u: Urgency) => (Object.keys(URG) as (keyof typeof URG)[]).find((k) => URG[k] === u)!

/* ---------- types the UI uses ---------- */
export type Role = "donor" | "coordinator"
export type LiveRequest = {
  id: number
  group: Group
  units: number
  hospital: string
  area: string
  lat: number
  lng: number
  urgency: Urgency
  verified: boolean
  expiresAt: number
  createdAt: number
  status: RequestStatus
  responded: number // donors who raised their hand in the app
  coming: number // donors who said they're coming
  donated: number // donors who have donated for this request
  unitsReceived: number // units arranged outside outreach (blood bank, walk-in)
  closedAt?: number
  verifiedBy?: string | null
}
export type DonorAlert = { id: number; group: Group; units: number; hospital: string; area: string; urgency: Urgency; km: number; unread: boolean }
export type Impact = { filled: number; fillRate: number | null; medianFillMinutes: number | null; unitsArranged: number; handsRaised: number; donors: number; eligibleNow: number }
export type Supply = { id: number; within10: number; within25: number }
export type OutreachStatus = "responded" | "called" | "no_answer" | "coming" | "declined" | "donated"
export type Outreach = { donorId: number; name: string; group: Group; area: string; lat: number; lng: number; km: number; email: string; phone: string; status: OutreachStatus; updatedAt: number }
export type Match = { donorId: number; name: string; group: Group; area: string; community?: string | null; lat: number; lng: number; km: number; eligibility: string }
export type Contact = { donorId: number; email: string; phone: string; raisedHand: boolean }
export type DonorProfile = {
  id: number
  name: string
  group: Group
  area: string
  lat: number
  lng: number
  available: boolean
  phone: string
  lastDonationAt: string | null
}
export type Donation = { id: number; donatedAt: string }
export type Eligibility ={ eligible: boolean; nextEligibleAt: string | null; reason: string; rule: string }

type ApiRequest = { id: number; bloodGroup: ApiGroup; units: number; hospitalName: string; area: string; latitude: number; longitude: number; urgency: keyof typeof URG; verified: boolean; expiresAt: string; createdAt: string; responded?: number; coming?: number; donated?: number; unitsReceived?: number; status?: string; closedAt?: string; verifiedBy?: string | null }
const toRequest = (r: ApiRequest, status: RequestStatus = (r.status?.toLowerCase() as RequestStatus) ?? "open"): LiveRequest => ({
  id: r.id, group: toGroup(r.bloodGroup), units: r.units, hospital: r.hospitalName, area: r.area, lat: r.latitude, lng: r.longitude,
  urgency: URG[r.urgency], verified: r.verified, expiresAt: Date.parse(r.expiresAt), createdAt: Date.parse(r.createdAt), status,
  responded: r.responded ?? 0, coming: r.coming ?? 0, donated: r.donated ?? 0, unitsReceived: r.unitsReceived ?? 0,
  ...(r.closedAt ? { closedAt: Date.parse(r.closedAt), verifiedBy: r.verifiedBy } : {}),
})
type ApiDonor = { id: number; displayName: string; bloodGroup: ApiGroup; area: string; latitude: number; longitude: number; available: boolean; phone: string; lastDonationAt: string | null }
const toDonor = (d: ApiDonor): DonorProfile => ({ id: d.id, name: d.displayName, group: toGroup(d.bloodGroup), area: d.area, lat: d.latitude, lng: d.longitude, available: d.available, phone: d.phone, lastDonationAt: d.lastDonationAt })

/* ---------- endpoints ---------- */
type TokenResponse = { accessToken: string; user: { id: number; email: string; role: "DONOR" | "COORDINATOR" } }
const session = (r: TokenResponse) => ((token = r.accessToken), { email: r.user.email, role: r.user.role.toLowerCase() as Role })

export const api = {
  login: async (email: string, password: string) => session(await call<TokenResponse>("POST", "/auth/login", { email, password })),
  register: async (d: { email: string; password: string; displayName: string; group: Group; phone: string; area: string; lat: number; lng: number; lastDonationAt?: string; community?: string }) =>
    session(await call<TokenResponse>("POST", "/auth/register", {
      email: d.email, password: d.password, displayName: d.displayName, bloodGroup: fromGroup(d.group), phone: d.phone,
      area: d.area, latitude: d.lat, longitude: d.lng, ...(d.lastDonationAt ? { lastDonationAt: d.lastDonationAt } : {}), ...(d.community ? { community: d.community } : {}),
    })),

  // Current account; donors also get a safe profile summary (no phone).
  whoAmI: async () => {
    const m = await call<{ email: string; role: "DONOR" | "COORDINATOR"; donor: { displayName: string } | null }>("GET", "/auth/me")
    return { email: m.email, role: m.role.toLowerCase() as Role, name: m.donor?.displayName ?? null }
  },

  listRequests: async () => (await call<ApiRequest[]>("GET", "/blood-requests")).map((r) => toRequest(r)),
  createRequest: async (r: { group: Group; units: number; hospital: string; area: string; lat: number; lng: number; urgency: Urgency; expiresAt: Date }) =>
    toRequest(await call<ApiRequest>("POST", "/blood-requests", {
      bloodGroup: fromGroup(r.group), units: r.units, hospitalName: r.hospital, area: r.area, latitude: r.lat, longitude: r.lng,
      urgency: fromUrgency(r.urgency), expiresAt: r.expiresAt.toISOString(),
    })),
  updateRequest: async (id: number, p: { units?: number; unitsReceived?: number; urgency?: Urgency; expiresAt?: Date }) =>
    toRequest(await call<ApiRequest>("PATCH", `/blood-requests/${id}`, {
      ...p, urgency: p.urgency && fromUrgency(p.urgency), expiresAt: p.expiresAt?.toISOString(),
    })),
  verify: async (id: number) => toRequest(await call<ApiRequest>("POST", `/blood-requests/${id}/verify`)),
  fulfill: async (id: number) => toRequest(await call<ApiRequest>("POST", `/blood-requests/${id}/fulfill`), "fulfilled"),
  cancel: async (id: number) => toRequest(await call<ApiRequest>("POST", `/blood-requests/${id}/cancel`), "cancelled"),
  // Released one donor at a time and logged by the API.
  contact: (id: number, donorId: number) => call<Contact>("POST", `/blood-requests/${id}/matches/${donorId}/contact`),
  impact: () => call<Impact>("GET", "/blood-requests/impact"),
  communities: () => call<{ name: string; donors: number }[]>("GET", "/blood-requests/communities"),
  matches: async (id: number, maxDistanceKm: number, community?: string) =>
    (await call<(Omit<Match, "name" | "group" | "km" | "lat" | "lng"> & { displayName: string; bloodGroup: ApiGroup; distanceKm: number; latitude: number; longitude: number })[]>("POST", `/blood-requests/${id}/matches?maxDistanceKm=${maxDistanceKm}${community ? `&community=${encodeURIComponent(community)}` : ""}`))
      .map((m) => ({ donorId: m.donorId, name: m.displayName, group: toGroup(m.bloodGroup), area: m.area, community: m.community, lat: m.latitude, lng: m.longitude, km: m.distanceKm, eligibility: m.eligibility })),
  outreach: async (id: number) =>
    (await call<{ donorId: number; displayName: string; bloodGroup: ApiGroup; area: string; latitude: number; longitude: number; distanceKm: number; email: string; phone: string; status: string; updatedAt: string }[]>("GET", `/blood-requests/${id}/outreach`))
      .map((o) => ({ donorId: o.donorId, name: o.displayName, group: toGroup(o.bloodGroup), area: o.area, lat: o.latitude, lng: o.longitude, km: o.distanceKm, email: o.email, phone: o.phone, status: o.status.toLowerCase() as OutreachStatus, updatedAt: Date.parse(o.updatedAt) })),
  setOutreach: async (id: number, donorId: number, status: OutreachStatus) =>
    toRequest(await call<ApiRequest>("PUT", `/blood-requests/${id}/outreach/${donorId}`, { status: status.toUpperCase() })),
  requestStatus: async (id: number) => toRequest(await call<ApiRequest>("GET", `/blood-requests/${id}/status`)),
  closedRequests: async () => (await call<ApiRequest[]>("GET", "/blood-requests/closed")).map((r) => toRequest(r)),
  supply: () => call<Supply[]>("GET", "/blood-requests/supply"),
  // Donor side: "I can come"
  respond: async (id: number) => toRequest(await call<ApiRequest>("POST", `/blood-requests/${id}/respond`)),
  withdraw: async (id: number) => toRequest(await call<ApiRequest>("DELETE", `/blood-requests/${id}/respond`)),
  myResponses: async () =>
    Object.fromEntries((await call<{ requestId: number; status: string }[]>("GET", "/blood-requests/responses/me")).map((r) => [r.requestId, r.status.toLowerCase() as OutreachStatus])) as Record<number, OutreachStatus>,

  me: async () => toDonor(await call<ApiDonor>("GET", "/donors/me")),
  donations: () => call<Donation[]>("GET", "/donors/me/donations"),
  addDonation: async (at: Date) => toDonor(await call<ApiDonor>("POST", "/donors/me/donations", { donatedAt: at.toISOString() })),
  removeDonation: async (id: number) => toDonor(await call<ApiDonor>("DELETE", `/donors/me/donations/${id}`)),
  updateMe: async (patch: Partial<{ available: boolean; area: string; latitude: number; longitude: number; community: string }>) => toDonor(await call<ApiDonor>("PATCH", "/donors/me", patch)),
  alerts: async () => {
    const r = await call<{ unread: number; alerts: { id: number; bloodGroup: ApiGroup; units: number; hospitalName: string; area: string; urgency: keyof typeof URG; distanceKm: number; unread: boolean }[] }>("GET", "/donors/me/alerts")
    return { unread: r.unread, alerts: r.alerts.map((a): DonorAlert => ({ id: a.id, group: toGroup(a.bloodGroup), units: a.units, hospital: a.hospitalName, area: a.area, urgency: URG[a.urgency], km: a.distanceKm, unread: a.unread })) }
  },
  markAlertsSeen: () => call<{ unread: number }>("POST", "/donors/me/alerts/seen"),
  eligibility: () => call<Eligibility>("GET", "/donors/me/eligibility"),

  // Blood donation drives / camps
  drives: async (near?: { lat: number; lng: number }) => (await call<ApiDrive[]>("GET", `/drives${near ? `?lat=${near.lat}&lng=${near.lng}` : ""}`)).map(toDrive),
  createDrive: async (d: Omit<ApiDrive, "id" | "rsvpCount" | "distanceKm">) => toDrive(await call<ApiDrive>("POST", "/drives", d)),
  myRsvps: () => call<number[]>("GET", "/drives/rsvps/me"),
  rsvp: async (id: number) => toDrive(await call<ApiDrive>("POST", `/drives/${id}/rsvp`)),
  cancelRsvp: async (id: number) => toDrive(await call<ApiDrive>("DELETE", `/drives/${id}/rsvp`)),
}

type ApiDrive = { id: number; title: string; organizer: string; venue: string; area: string; latitude: number; longitude: number; startsAt: string; endsAt: string; capacity: number | null; rsvpCount: number; distanceKm?: number }
export type Drive = Omit<ApiDrive, "startsAt" | "endsAt" | "latitude" | "longitude"> & { lat: number; lng: number; startsAt: number; endsAt: number }
const toDrive = ({ latitude, longitude, startsAt, endsAt, ...d }: ApiDrive): Drive => ({ ...d, lat: latitude, lng: longitude, startsAt: Date.parse(startsAt), endsAt: Date.parse(endsAt) })

export const requestLabel = (id: number) => `RQ-${String(id).padStart(4, "0")}`

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = (d: number) => (d * Math.PI) / 180
  const h = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLng - aLng) / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

// Self-check: enum mapping must round-trip for every group.
if (import.meta.env.DEV) for (const g of GROUPS) console.assert(toGroup(fromGroup(g)) === g, `group mapping broken for ${g}`)
