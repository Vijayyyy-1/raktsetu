import { useEffect, useState, type FormEvent, type InputHTMLAttributes } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { CalendarPlus, Check, Clock, ExternalLink, Loader2, MapPin, Navigation, Phone, Plus, Search, Users } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Btn, SPRING, SectionHead, fadeUp, popIn } from "@/components/bits"
import { api, distanceKm, type Drive, type Eligibility, type Role } from "@/api"
import { nearbyBloodBanks, placeLocation, searchPlaces, type BloodBank, type Suggestion } from "@/places"
import { cn } from "@/lib/utils"

const PUNE = { lat: 18.5204, lng: 73.8567 }
const ERAKTKOSH_CAMPS = "https://eraktkosh.mohfw.gov.in/BLDAHIMS/bloodbank/campSchedule.cnt"

export function Drives({ role }: { role: Role }) {
  const donor = role === "donor"
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(donor ? null : PUNE)
  const [elig, setElig] = useState<Eligibility | null>(null)
  const [drives, setDrives] = useState<Drive[] | null>(null)
  const [mine, setMine] = useState<Set<number>>(new Set())
  const [banks, setBanks] = useState<BloodBank[] | null>(null)
  const [creating, setCreating] = useState(false)

  // Donors: use their saved (approximate) location; coordinators: city centre.
  useEffect(() => {
    if (!donor) return
    api.me().then((m) => setHere({ lat: m.lat, lng: m.lng })).catch(() => setHere(PUNE))
    api.eligibility().then(setElig).catch(() => {})
    api.myRsvps().then((ids) => setMine(new Set(ids))).catch(() => {})
  }, [donor])

  useEffect(() => {
    if (!here) return
    api.drives(here).then(setDrives).catch((e) => (toast.error(e.message), setDrives([])))
    nearbyBloodBanks(here).then(setBanks).catch(() => setBanks([]))
  }, [here])

  const replace = (d: Drive) => setDrives((ds) => (ds ?? []).map((x) => (x.id === d.id ? { ...d, distanceKm: x.distanceKm } : x)))
  const toggle = async (d: Drive) => {
    const going = mine.has(d.id)
    try {
      replace(going ? await api.cancelRsvp(d.id) : await api.rsvp(d.id))
      setMine((s) => { const n = new Set(s); going ? n.delete(d.id) : n.add(d.id); return n })
      toast.success(going ? "RSVP cancelled" : "You're in! See you there 🩸", { description: going ? undefined : `${d.title} · ${fmtDay(d.startsAt)}` })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <motion.div {...fadeUp} className="space-y-12">
      <SectionHead
        kicker="Blood donation drives"
        title={donor ? <>Give blood <span className="italic text-blood">near you</span></> : <>Drives &amp; <span className="italic text-blood">camps</span></>}
        sub={donor ? "Camps run by Rotaract clubs, colleges and NGOs. RSVP so organisers know you're coming." : "Post a drive and see who's coming. Donors nearby see it on their Drives tab."}
      >
        {!donor && <Btn size="lg" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New drive</Btn>}
      </SectionHead>

      {/* 1 — Drives */}
      <section>
        {drives === null ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-64 animate-pulse rounded-[28px] bg-white/60" />)}</div>
        ) : drives.length === 0 ? (
          <p className="soft-card p-8 text-center text-muted-foreground">No upcoming drives yet. {donor ? "Check the official schedule below." : "Post the first one!"}</p>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {drives.map((d, i) => <DriveCard key={d.id} i={i} d={d} donor={donor} going={mine.has(d.id)} elig={elig} onToggle={() => toggle(d)} />)}
          </div>
        )}
      </section>

      {/* 2 — Any day */}
      <section>
        <h2 className="text-3xl font-medium">Or donate <span className="italic text-blood">any day</span></h2>
        <p className="mt-1 text-sm text-muted-foreground">Blood banks near {donor ? "you" : "Pune"} accept walk-in donors. Call ahead to check timings.</p>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {banks === null
            ? [0, 1].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/60" />)
            : banks.length === 0
              ? <p className="text-sm text-muted-foreground">Couldn't load nearby blood banks right now.</p>
              : banks.map((b, i) => <BankRow key={b.id} i={i} b={b} from={here!} />)}
        </div>
      </section>

      {/* 3 — Official schedule */}
      <a href={ERAKTKOSH_CAMPS} target="_blank" rel="noreferrer" className="soft-card group flex flex-wrap items-center gap-5 p-6 transition-transform hover:-translate-y-0.5">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-blood-soft text-blood"><Search className="h-6 w-6" /></div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-xl font-medium">See all government blood donation camps</div>
          <div className="text-sm text-muted-foreground">The national e-RaktKosh portal (Ministry of Health) lists camps by state, district and date — many allow online pre-registration.</div>
        </div>
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-blood">Open e-RaktKosh <ExternalLink className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
      </a>

      {!donor && <NewDriveDialog open={creating} onOpenChange={setCreating} onCreated={(d) => setDrives((ds) => [...(ds ?? []), d].sort((a, b) => a.startsAt - b.startsAt))} />}
    </motion.div>
  )
}

/* ---------------- pieces ---------------- */

const fmtDay = (ms: number) => new Date(ms).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })
const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
const gcalDate = (ms: number) => new Date(ms).toISOString().replace(/[-:]|\.\d{3}/g, "")

function DriveCard({ d, i, donor, going, elig, onToggle }: { d: Drive; i: number; donor: boolean; going: boolean; elig: Eligibility | null; onToggle: () => void }) {
  const [busy, setBusy] = useState(false)
  const start = new Date(d.startsAt)
  const full = d.capacity !== null && d.rsvpCount >= d.capacity && !going
  const next = elig?.nextEligibleAt ? Date.parse(elig.nextEligibleAt) : null
  // Encourage: tell the donor whether they'll be able to give on the day.
  const readyNote = !donor || !elig ? null : elig.eligible || (next !== null && next <= d.startsAt)
    ? { ok: true, text: "You'll be eligible on the day" }
    : next !== null ? { ok: false, text: `You'll be ready from ${fmtDay(next)}` } : null
  const calUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(d.title)}&dates=${gcalDate(d.startsAt)}/${gcalDate(d.endsAt)}&location=${encodeURIComponent(`${d.venue}, ${d.area}`)}&details=${encodeURIComponent(`Blood donation drive by ${d.organizer}. Bring a photo ID, eat well and stay hydrated.`)}`

  return (
    <motion.article {...popIn(i)} className={cn("soft-card flex flex-col p-6", going && "ring-2 ring-ok/50")}>
      <div className="flex items-start gap-4">
        <div className="w-16 shrink-0 overflow-hidden rounded-2xl text-center shadow-sm">
          <div className="bg-blood py-1 text-[11px] font-bold uppercase tracking-wide text-white">{start.toLocaleDateString("en-IN", { month: "short" })}</div>
          <div className="bg-white py-1.5 font-display text-2xl font-semibold leading-none">{start.getDate()}<div className="mt-0.5 text-[10px] font-sans font-semibold uppercase text-muted-foreground">{start.toLocaleDateString("en-IN", { weekday: "short" })}</div></div>
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-xl font-medium leading-tight">{d.title}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{d.organizer}</p>
        </div>
      </div>

      <div className="mt-5 space-y-1.5 text-sm">
        <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-blood/70" />{fmtTime(d.startsAt)} – {fmtTime(d.endsAt)}</div>
        <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-blood/70" /><span className="truncate">{d.venue}, {d.area}</span>{d.distanceKm !== undefined && <span className="shrink-0 text-muted-foreground">· {d.distanceKm} km</span>}</div>
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex justify-between text-xs">
          <span className="flex items-center gap-1 text-muted-foreground"><Users className="h-3.5 w-3.5" />{d.rsvpCount} going</span>
          {d.capacity !== null && <span className="text-muted-foreground">{Math.max(0, d.capacity - d.rsvpCount)} spots left</span>}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <motion.div className="h-full rounded-full bg-gradient-to-r from-[#FF7B72] to-[#C9303F]" initial={{ width: 0 }} animate={{ width: `${d.capacity ? Math.min(100, (d.rsvpCount / d.capacity) * 100) : Math.min(100, d.rsvpCount * 5)}%` }} transition={SPRING} />
        </div>
      </div>

      {readyNote && <p className={cn("mt-4 text-xs font-semibold", readyNote.ok ? "text-ok" : "text-amber-700")}>{readyNote.ok ? "✓ " : ""}{readyNote.text}</p>}

      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        {donor && (
          <Btn className="flex-1" variant={going ? "ok" : "primary"} disabled={busy || full} onClick={async () => { setBusy(true); await onToggle(); setBusy(false) }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={going ? "going" : "rsvp"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="inline-flex items-center gap-1.5">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : going ? <><Check className="h-4 w-4" /> Going</> : full ? "Drive full" : "I'll be there"}
              </motion.span>
            </AnimatePresence>
          </Btn>
        )}
        <a href={calUrl} target="_blank" rel="noreferrer" className="grid h-10 w-10 place-items-center rounded-full bg-muted transition-colors hover:bg-secondary" aria-label="Add to Google Calendar" title="Add to calendar"><CalendarPlus className="h-4 w-4" /></a>
        <a href={`https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}`} target="_blank" rel="noreferrer" className="grid h-10 w-10 place-items-center rounded-full bg-muted transition-colors hover:bg-secondary" aria-label="Directions" title="Directions"><Navigation className="h-4 w-4" /></a>
      </div>
    </motion.article>
  )
}

function BankRow({ b, i, from }: { b: BloodBank; i: number; from: { lat: number; lng: number } }) {
  return (
    <motion.div {...popIn(i)} className="soft-card flex items-center gap-4 p-4">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blood-soft font-display font-semibold text-blood">{Math.round(distanceKm(from.lat, from.lng, b.lat, b.lng) * 10) / 10}<span className="-mt-1 text-[9px]">km</span></div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold">{b.name}</span>
          {b.openNow !== undefined && <span className={cn("pill shrink-0 py-0.5", b.openNow ? "bg-emerald-50 text-ok" : "bg-muted text-muted-foreground")}>{b.openNow ? "Open now" : "Closed"}</span>}
        </div>
        <div className="truncate text-xs text-muted-foreground">{b.address}</div>
      </div>
      {b.phone && <a href={`tel:${b.phone}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted hover:bg-secondary" aria-label={`Call ${b.name}`}><Phone className="h-4 w-4" /></a>}
      <a href={b.mapsUrl} target="_blank" rel="noreferrer" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted hover:bg-secondary" aria-label={`Open ${b.name} in Google Maps`}><Navigation className="h-4 w-4" /></a>
    </motion.div>
  )
}

function NewDriveDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (d: Drive) => void }) {
  const [q, setQ] = useState("")
  const [results, setResults] = useState<Suggestion[]>([])
  const [place, setPlace] = useState<{ venue: string; area: string; lat: number; lng: number } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (place || q.trim().length < 3) return setResults([])
    const t = setTimeout(() => searchPlaces(q).then(setResults).catch(() => setResults([])), 300)
    return () => clearTimeout(t)
  }, [q, place])

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!place) return toast.error("Pick the venue from the search results")
    const f = new FormData(e.currentTarget)
    const date = String(f.get("date"))
    const cap = Number(f.get("capacity"))
    setBusy(true)
    try {
      const d = await api.createDrive({
        title: String(f.get("title")), organizer: String(f.get("organizer")), venue: place.venue, area: place.area, latitude: place.lat, longitude: place.lng,
        startsAt: new Date(`${date}T${f.get("from")}`).toISOString(), endsAt: new Date(`${date}T${f.get("to")}`).toISOString(), capacity: cap > 0 ? cap : null,
      })
      onCreated(d)
      toast.success("Drive posted", { description: "Donors nearby can now RSVP." })
      onOpenChange(false)
      setPlace(null), setQ("")
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[32px] border-0 p-8 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl font-medium">New drive</DialogTitle>
          <DialogDescription>Donors near the venue will see it on their Drives tab.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <Field label="Title" name="title" required minLength={3} placeholder="COEP Rotaract Blood Drive" />
          <Field label="Organiser" name="organizer" required minLength={2} placeholder="Rotaract Club of COEP" />
          <div className="relative">
            <span className="ml-4 text-xs font-semibold text-muted-foreground">Venue</span>
            {place ? (
              <div className="mt-1 flex items-center justify-between rounded-full bg-emerald-50 px-5 py-3 text-sm">
                <span className="truncate font-semibold">{place.venue}</span>
                <button type="button" onClick={() => setPlace(null)} className="text-xs font-semibold text-ok hover:underline">Change</button>
              </div>
            ) : (
              <>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a college, hall or hospital" className="mt-1 h-12 w-full rounded-full border border-input bg-white px-5 text-sm outline-none focus:border-blood/50 focus:ring-4 focus:ring-blood/10" />
                {results.length > 0 && (
                  <ul className="absolute inset-x-0 top-[4.5rem] z-10 rounded-2xl bg-white p-1.5 shadow-xl">
                    {results.map((s) => (
                      <li key={s.id}>
                        <button type="button" className="w-full rounded-xl px-3 py-2 text-left hover:bg-muted" onClick={async () => {
                          try { const at = await placeLocation(s.id); setPlace({ venue: s.main, area: s.secondary.split(",")[0] || s.main, ...at }) } catch (err) { toast.error((err as Error).message) }
                        }}>
                          <span className="block truncate text-sm font-semibold">{s.main}</span>
                          <span className="block truncate text-xs text-muted-foreground">{s.secondary}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Date" name="date" type="date" required min={new Date().toISOString().slice(0, 10)} />
            <Field label="From" name="from" type="time" required defaultValue="10:00" />
            <Field label="To" name="to" type="time" required defaultValue="16:00" />
          </div>
          <Field label="Capacity (optional)" name="capacity" type="number" min={1} max={5000} placeholder="e.g. 120" />
          <Btn type="submit" size="lg" className="w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post drive"}</Btn>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, ...rest }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="ml-4 text-xs font-semibold text-muted-foreground">{label}</span>
      <input {...rest} className="mt-1 h-12 w-full rounded-full border border-input bg-white px-4 text-sm outline-none focus:border-blood/50 focus:ring-4 focus:ring-blood/10" />
    </label>
  )
}
