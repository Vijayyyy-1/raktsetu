import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, Building2, Check, CheckCircle2, ChevronDown, Loader2, Lock, Mail, Phone } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Slider } from "@/components/ui/slider"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { BloodChip, Btn, Drop, EstimateNote, SPRING, UrgencyTag, VerifiedTag, fadeUp } from "@/components/bits"
import { api, requestLabel, type Contact, type LiveRequest, type Match, type Outreach, type OutreachStatus } from "@/api"
import { CAN_RECEIVE } from "@/data"
import { Countdown, Progress } from "./Requests"
import { DonorsMap } from "@/components/DonorsMap"
import { BloodBanksNear, ERAKTKOSH, ExtLink } from "@/components/BloodBanks"
import { cn } from "@/lib/utils"

const MAX_KM = 50

export function Matches({ req, now, onBack, onChange }: { req: LiveRequest; now: number; onBack: () => void; onChange: (r: LiveRequest) => void }) {
  const [radius, setRadius] = useState(10)
  const [query, setQuery] = useState(10) // radius actually sent to the API (on slider release)
  const [matches, setMatches] = useState<Match[] | null>(null)
  const [reveal, setReveal] = useState<Match | null>(null)
  const [revealed, setRevealed] = useState<Record<number, Contact>>({})
  const [revealing, setRevealing] = useState(false)
  // Contacts come from the API one donor at a time (logged server-side), not with the match list.
  const showContact = async () => {
    if (!reveal) return
    setRevealing(true)
    try {
      const c = await api.contact(req.id, reveal.donorId)
      setRevealed((p) => ({ ...p, [c.donorId]: c }))
      setReveal(null)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setRevealing(false)
    }
  }
  const [closing, setClosing] = useState(false)
  const [done, setDone] = useState(false)
  const [outreach, setOutreach] = useState<Outreach[]>([])
  const [focus, setFocus] = useState<number | null>(null) // donor highlighted on map + list
  const status = useMemo(() => Object.fromEntries(outreach.map((o) => [o.donorId, o.status])) as Record<number, OutreachStatus>, [outreach])

  useEffect(() => void api.outreach(req.id).then(setOutreach).catch((e) => toast.error(e.message)), [req.id])

  const track = async (d: Match, next: OutreachStatus) => {
    try {
      onChange(await api.setOutreach(req.id, d.donorId, next))
      setOutreach(await api.outreach(req.id))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  useEffect(() => {
    let live = true
    setMatches(null)
    api.matches(req.id, query).then((m) => live && setMatches(m)).catch((e) => live && (toast.error(e.message), setMatches([])))
    return () => void (live = false)
  }, [req.id, query])

  const fulfil = async () => {
    setClosing(true)
    try {
      onChange(await api.fulfill(req.id))
      setDone(true)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setClosing(false)
    }
  }

  // Memoised: the page re-renders every second for the countdown and the map must not redraw with it.
  const list: Match[] = useMemo(() => {
    const raised = new Set(outreach.filter((o) => o.status === "responded").map((o) => o.donorId))
    const worked = outreach.filter((o) => !matches?.some((m) => m.donorId === o.donorId)).map((o) => ({ ...o, eligibility: "" }))
    return [...(matches ?? []), ...worked].sort((a, b) => Number(raised.has(b.donorId)) - Number(raised.has(a.donorId)))
  }, [matches, outreach])
  const pickDot = (id: number | null) => {
    setFocus(id)
    if (id !== null) document.getElementById(`donor-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }

  const checks = [
    `Blood group can give to ${req.group} (${CAN_RECEIVE[req.group].join(", ")})`,
    "Donor has marked themselves available",
    "Estimated eligible by last donation date",
    `Within ${query} km of ${req.hospital}`,
  ]

  return (
    <motion.div {...fadeUp} className="space-y-6">
      <button onClick={onBack} className="group inline-flex items-center gap-1.5 rounded-full bg-white/70 px-4 py-2 text-sm font-medium shadow-sm hover:bg-white">
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" /> All requests
      </button>

      <div className="soft-card flex flex-wrap items-center gap-5 p-6">
        <BloodChip group={req.group} size="lg" />
        <div className="min-w-[12rem] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-medium sm:text-4xl">{req.units} units of {req.group}</h1>
            <UrgencyTag u={req.urgency} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><Building2 className="h-4 w-4" />{req.hospital}</span>
            <VerifiedTag verified={req.verified} />
            <span className="text-xs">{requestLabel(req.id)}</span>
          </div>
        </div>
        {!done && (
          <div className="rounded-2xl bg-blood-soft px-5 py-3 text-right max-sm:w-full max-sm:text-left">
            <div className="text-xs text-blood/80">Closes in</div>
            <Countdown at={req.expiresAt} now={now} className="font-display text-2xl font-medium text-blood" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="soft-card p-6">
          <h2 className="text-2xl font-medium">Who's nearby</h2>
          <DonorsMap
            at={{ lat: req.lat, lng: req.lng }}
            radiusKm={radius}
            donors={list}
            status={status}
            focus={focus}
            onFocus={pickDot}
            fallback={<Radar radius={radius} matches={matches ?? []} loading={matches === null} />}
          />

          <ol className="space-y-1">
            {checks.map((c, i) => (
              <motion.li key={c} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }} className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blood text-white"><Check className="h-3.5 w-3.5" /></span>
                {c}
              </motion.li>
            ))}
          </ol>

          <div className="mt-4 rounded-2xl bg-muted p-4">
            <div className="mb-3 flex justify-between text-sm"><span className="font-medium">Search radius</span><span className="font-display font-semibold">{radius} km</span></div>
            <Slider min={1} max={MAX_KM} step={1} value={[radius]} onValueChange={([v]) => setRadius(v)} onValueCommit={([v]) => setQuery(v)} />
          </div>
          <EstimateNote className="mt-4 px-1" />
        </div>

        <div className="soft-card p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-medium">{matches === null ? "Looking…" : `${matches.length} ${matches.length === 1 ? "donor" : "donors"} can help`}</h2>
              <p className="text-sm text-muted-foreground">Nearest first · contact details hidden until you need them</p>
            </div>
            {!done && matches && matches.length > 0 && (
              <Btn size="lg" variant="ok" onClick={fulfil} disabled={closing}>
                {closing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Need met — close it
              </Btn>
            )}
          </div>

          <Progress req={req} />

          {matches === null ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-[68px] animate-pulse rounded-2xl bg-muted" style={{ animationDelay: `${i * 120}ms` }} />)}
            </div>
          ) : list.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">No one eligible within {query} km yet — try widening the radius.</div>
          ) : (
            <motion.ul layout className="space-y-2">
              {list.map((d, i) => (
                <motion.li
                  key={d.donorId}
                  id={`donor-${d.donorId}`}
                  onMouseEnter={() => setFocus(d.donorId)}
                  onMouseLeave={() => setFocus(null)}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...SPRING, delay: i * 0.05 }}
                  className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl p-3 ring-2 transition-shadow", revealed[d.donorId] ? "bg-emerald-50" : "bg-muted/60", focus === d.donorId ? "ring-foreground/70" : "ring-transparent")}
                >
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white font-display text-sm font-semibold text-blood shadow-sm">{initials(d.name)}</div>
                  <div className="min-w-[9rem] flex-1">
                    <div className="truncate font-semibold">{d.name} <span className="ml-1 text-xs font-medium text-blood">{d.group}</span></div>
                    <div className="truncate text-xs text-muted-foreground">{d.area} · {d.km} km away</div>
                  </div>
                  <StatusPicker value={status[d.donorId]} onPick={(s) => track(d, s)} />
                  {revealed[d.donorId] ? (
                    <div className="text-right text-sm">
                      <a href={`tel:${revealed[d.donorId].phone}`} className="flex items-center justify-end gap-1.5 font-semibold text-ok hover:underline"><Phone className="h-3.5 w-3.5" />{revealed[d.donorId].phone}</a>
                      <a href={`mailto:${revealed[d.donorId].email}`} className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground hover:underline"><Mail className="h-3 w-3" />{revealed[d.donorId].email}</a>
                    </div>
                  ) : (
                    <>
                      <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex"><Lock className="h-3 w-3" />Number hidden</span>
                      <Btn variant="dark" className="h-9 px-3 text-xs" onClick={() => setReveal(d)}><Phone className="h-3.5 w-3.5" />Contact</Btn>
                    </>
                  )}
                </motion.li>
              ))}
            </motion.ul>
          )}
        </div>
      </div>

      {/* Backup plan: if donors aren't enough, the coordinator can source from a blood bank. */}
      <BloodBanksNear
        at={{ lat: req.lat, lng: req.lng }}
        className={cn("rounded-[28px] p-6", matches !== null && matches.length < req.units ? "bg-blood-soft" : "bg-white/50")}
        title={matches !== null && matches.length < req.units ? <>Not enough donors? <span className="italic text-blood">Call a blood bank</span></> : <>Backup: blood banks near <span className="italic text-blood">{req.hospital}</span></>}
        sub={`Ask if they have ${req.group} in stock before the request runs out of time.`}
        footer={<p className="mt-4 text-sm text-muted-foreground">Or <ExtLink href={ERAKTKOSH.stock}>check live blood stock on e-RaktKosh</ExtLink></p>}
      />

      <Dialog open={!!reveal} onOpenChange={(o) => !o && setReveal(null)}>
        <DialogContent className="rounded-[32px] border-0 p-8">
          <DialogHeader>
            <div className="mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-blood-soft text-blood"><Lock className="h-5 w-5" /></div>
            <DialogTitle className="font-display text-2xl font-medium">Contact {reveal?.name}?</DialogTitle>
            <DialogDescription>
              Use this only to coordinate {requestLabel(req.id)}. Don't forward or save the number anywhere else. This access is logged.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setReveal(null)}>Not now</Btn>
            <Btn disabled={revealing} onClick={showContact}>{revealing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}Show contact</Btn>
          </div>
        </DialogContent>
      </Dialog>

      <AnimatePresence>
        {done && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-[#fff8f6]/80 p-6 backdrop-blur-md">
            <motion.div initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} transition={SPRING} className="soft-card max-w-sm p-10 text-center">
              <Drop className="mx-auto h-28 w-24">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...SPRING, delay: 0.25 }}><Check className="h-10 w-10 text-white" strokeWidth={3} /></motion.div>
              </Drop>
              <h2 className="mt-6 text-4xl font-medium">Need met.</h2>
              <p className="mt-2 text-muted-foreground">{requestLabel(req.id)} is closed and no longer shown to donors — no stale “urgent” messages left behind.</p>
              <Btn size="lg" className="mt-8 w-full" onClick={onBack}>Back to requests</Btn>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

const STATUS: Record<OutreachStatus, { label: string; tone: string }> = {
  responded: { label: "✋ Raised hand", tone: "bg-amber-100 text-amber-900" },
  called: { label: "Called", tone: "bg-white text-foreground" },
  no_answer: { label: "No answer", tone: "bg-peach text-[#7a3a14]" },
  coming: { label: "Coming", tone: "bg-blood text-white" },
  declined: { label: "Declined", tone: "bg-muted text-muted-foreground line-through" },
  donated: { label: "Donated", tone: "bg-ok text-white" },
}

function StatusPicker({ value, onPick }: { value?: OutreachStatus; onPick: (s: OutreachStatus) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Outreach status" className={cn("inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold shadow-sm", value ? STATUS[value].tone : "bg-white text-muted-foreground")}>
        {value ? STATUS[value].label : "Mark"} <ChevronDown className="h-3 w-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="rounded-2xl p-1.5">
        {(Object.keys(STATUS) as OutreachStatus[]).filter((s) => s !== "responded").map((s) => (
          <DropdownMenuItem key={s} className="rounded-xl" onClick={() => onPick(s)}>
            {value === s && <Check className="h-3.5 w-3.5" />}{STATUS[s].label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const initials = (name: string) => name.replace(/\(.*?\)/g, "").trim().split(/\s+/).map((n) => n[0]).join("").slice(0, 2).toUpperCase()

/** Matched donors plotted around the hospital by real distance; the shaded circle is the search radius. */
function Radar({ radius, matches, loading }: { radius: number; matches: Match[]; loading: boolean }) {
  const R = 140
  const scale = (km: number) => (Math.min(km, MAX_KM) / MAX_KM) * R
  return (
    <svg viewBox="-160 -160 320 320" className="mx-auto my-4 w-full max-w-[340px]" role="img" aria-label={`${matches.length} donors within ${radius} km`}>
      {[0.25, 0.5, 0.75, 1].map((f) => <circle key={f} r={R * f} fill="none" stroke="hsl(8 40% 90%)" strokeDasharray="2 4" />)}
      <motion.circle animate={{ r: scale(radius) }} transition={SPRING} fill="hsl(6 85% 95% / 0.7)" stroke="hsl(0 68% 54% / 0.35)" />
      {loading && (
        <g className="animate-spin" style={{ animationDuration: "2s", transformBox: "view-box", transformOrigin: "0 0" }}>
          <line x1="0" y1="0" x2="0" y2={-R} stroke="hsl(0 68% 54% / 0.35)" strokeWidth="2" />
        </g>
      )}
      {matches.map((d, i) => {
        const a = d.donorId * 2.39996 // golden angle spreads dots evenly
        return (
          <motion.circle key={d.donorId} cx={Math.cos(a) * scale(d.km)} cy={Math.sin(a) * scale(d.km)} initial={{ r: 0 }} animate={{ r: 6 }} transition={{ ...SPRING, delay: i * 0.05 }} fill="hsl(0 68% 54%)" />
        )
      })}
      <circle r="9" fill="hsl(340 22% 14%)" />
      <path d="M-3.5 0h7M0 -3.5v7" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
