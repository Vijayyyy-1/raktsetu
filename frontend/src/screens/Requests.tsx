import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, ArrowRight, LayoutGrid, Map as MapIcon, Building2, CheckCircle2, Hand, Loader2, Users, MapPin, MoreHorizontal, Plus, RefreshCw, Share2, ShieldCheck, X } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BloodChip, Btn, SPRING, SectionHead, StatusTag, UrgencyTag, VerifiedTag, fadeUp, popIn } from "@/components/bits"
import { api, distanceKm, requestLabel, type DonorProfile, type LiveRequest, type OutreachStatus, type Supply } from "@/api"
import { CAN_RECEIVE, GROUPS, HOSPITALS, type Group, type RequestStatus, type Urgency } from "@/data"
import { RequestsMap } from "@/components/RequestsMap"
import { ImpactStrip } from "@/components/ImpactStrip"
import { cn } from "@/lib/utils"

// Expiry is computed on read, same rule as the API.
export const statusOf = (r: LiveRequest, now: number): RequestStatus => (r.status === "open" && r.expiresAt <= now ? "expired" : r.status)

const WINDOW: Record<Urgency, number> = { critical: 2, urgent: 6, planned: 24 } // hours until auto-expiry

export function Countdown({ at, now, className }: { at: number; now: number; className?: string }) {
  const s = Math.max(0, Math.floor((at - now) / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return <span className={cn("tabular-nums", className)}>{h > 0 ? `${h}h ${m}m` : `${m}m ${String(s % 60).padStart(2, "0")}s`}</span>
}

/** Units covered: donated (solid) and pledged (lighter), out of the units the request needs. */
export function Progress({ req, compact }: { req: LiveRequest; compact?: boolean }) {
  const pct = (n: number) => `${Math.min(100, (n / req.units) * 100)}%`
  const received = req.donated + req.unitsReceived
  return (
    <div className={compact ? "" : "mb-4 rounded-2xl bg-muted/60 p-4"}>
      <div className="mb-1.5 flex justify-between text-xs">
        <span className="text-muted-foreground"><b className="text-ok">{received} received</b> · <b className="text-blood">{req.coming} coming</b></span>
        <span className="font-semibold">of {req.units} unit{req.units > 1 && "s"}</span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-white">
        <motion.div className="absolute inset-y-0 left-0 rounded-full bg-blood/35" animate={{ width: pct(received + req.coming) }} />
        <motion.div className="absolute inset-y-0 left-0 rounded-full bg-ok" animate={{ width: pct(received) }} />
      </div>
    </div>
  )
}

type Props = {
  requests: LiveRequest[] | null
  now: number
  onChange: (r: LiveRequest) => void
  onRefresh: () => void
  onMatch?: (id: number) => void
  readOnly?: boolean
}

export function Requests({ requests, now, onChange, onRefresh, onMatch, readOnly }: Props) {
  const [tab, setTab] = useState<Tab>(readOnly ? "mine" : "active")
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<"cards" | "map">("cards")
  const [me, setMe] = useState<DonorProfile | null>(null)
  const [responses, setResponses] = useState<Record<number, OutreachStatus>>({})
  useEffect(() => {
    if (!readOnly) return
    api.me().then(setMe).catch((e) => toast.error(e.message))
    api.myResponses().then(setResponses).catch(() => {})
  }, [readOnly])
  const all = requests ?? []
  const ids = all.map((r) => r.id).join()
  // Coordinator: eligible-donor coverage per request; refetched whenever the set of requests changes.
  const [supply, setSupply] = useState<Record<number, Supply>>({})
  useEffect(() => {
    if (readOnly || !ids) return
    api.supply().then((rows) => setSupply(Object.fromEntries(rows.map((r) => [r.id, r])))).catch(() => {})
  }, [readOnly, ids])
  const setResponse = (id: number, s: OutreachStatus | null) => setResponses(({ [id]: _, ...rest }) => (s ? { ...rest, [id]: s } : rest))
  // Coordinator: closed history from the API (last 30 days) plus anything closed or expired in this session.
  const [history, setHistory] = useState<LiveRequest[]>([])
  useEffect(() => {
    if (readOnly || tab !== "closed") return
    api.closedRequests().then(setHistory).catch((e) => toast.error(e.message))
  }, [readOnly, tab, ids])
  const sessionClosed = all.filter((r) => statusOf(r, now) !== "open")
  const closed = [...sessionClosed.filter((r) => !history.some((h) => h.id === r.id)), ...history]
  const active = all.filter((r) => statusOf(r, now) === "open")
  // Donors see verified needs only, nearest first; "mine" narrows to groups their blood can serve.
  const feed = active
    .filter((r) => r.verified)
    .map((r) => ({ r, km: me ? Math.round(distanceKm(me.lat, me.lng, r.lat, r.lng) * 10) / 10 : undefined, canGive: !!me && CAN_RECEIVE[r.group].includes(me.group) }))
    .sort((a, b) => (a.km ?? 0) - (b.km ?? 0))
  const mine = feed.filter((f) => f.canGive)
  // Coordinator triage: tiles filter the open list; unverified first (they block matching), then soonest to close.
  const [filter, setFilter] = useState<Filter | null>(null)
  const triage = active
    .filter((r) => !filter || FILTERS[filter](r))
    .sort((a, b) => Number(a.verified) - Number(b.verified) || a.expiresAt - b.expiresAt)
  const pickFilter = (f: Filter) => (setFilter((cur) => (cur === f ? null : f)), setTab("active"))
  const shown: { r: LiveRequest; km?: number; canGive?: boolean }[] = readOnly
    ? tab === "mine" ? mine : feed
    : (tab === "active" ? triage : closed).map((r) => ({ r }))
  const tabs: { id: Tab; label: string }[] = readOnly
    ? [{ id: "mine", label: `You can donate · ${mine.length}` }, { id: "all", label: `All groups · ${feed.length}` }]
    : [{ id: "active", label: `Open · ${active.length}` }, { id: "closed", label: tab === "closed" ? `Closed · ${closed.length}` : "Closed" }]

  return (
    <motion.div {...fadeUp} className="space-y-6">
      <SectionHead
        kicker={readOnly ? "Near you" : "Coordinator desk"}
        title={readOnly ? <>Who needs <span className="italic text-blood">help</span> today</> : <>{active.length} {active.length === 1 ? "request is" : "requests are"} <span className="italic text-blood">open</span></>}
        sub={readOnly ? (tab === "mine" ? `Verified needs your ${me?.group ?? ""} blood can serve. No patient names or diagnoses, ever.` : "Every verified need — share one with family or friends who can help.") : undefined}
      >
        <div className="flex gap-2">
          <Btn variant="ghost" size="lg" onClick={onRefresh} aria-label="Refresh"><RefreshCw className="h-4 w-4" /></Btn>
          {!readOnly && <Btn size="lg" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New request</Btn>}
        </div>
      </SectionHead>

      {!readOnly && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat i={0} big={active.filter(FILTERS.critical).length} label="critical right now" tone="bg-blood text-white" active={filter === "critical"} onClick={() => pickFilter("critical")} />
          <Stat i={1} big={active.filter(FILTERS.verify).length} label="need verifying" tone="bg-peach text-[#7a3a14]" active={filter === "verify"} onClick={() => pickFilter("verify")} />
          <Stat i={2} big={active.filter(FILTERS.ready).length} label="ready to match" tone="bg-white" active={filter === "ready"} onClick={() => pickFilter("ready")} />
          <Stat i={3} big={active.reduce((n, r) => n + r.units, 0)} label="units still needed" tone="bg-emerald-50 text-ok" />
        </div>
      )}

      {!readOnly && <ImpactStrip refreshKey={ids} />}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex w-fit rounded-full bg-white/70 p-1 shadow-sm">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={cn("relative rounded-full px-5 py-2 text-sm font-semibold", tab !== t.id && "text-muted-foreground")}>
              {tab === t.id && <motion.span layoutId="req-tab" transition={SPRING} className="absolute inset-0 rounded-full bg-foreground" />}
              <span className={cn("relative", tab === t.id && "text-white")}>{t.label}</span>
            </button>
          ))}
        </div>
        {!readOnly && filter && tab === "active" && (
          <button onClick={() => setFilter(null)} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-muted">
            Showing: {FILTER_LABEL[filter]} <X className="h-3.5 w-3.5" aria-label="Clear filter" />
          </button>
        )}
        {!readOnly && tab === "active" && (
          <div className="ml-auto flex rounded-full bg-white/70 p-1 shadow-sm">
            {([["cards", LayoutGrid, "Cards"], ["map", MapIcon, "Map"]] as const).map(([v, Icon, label]) => (
              <button key={v} onClick={() => setView(v)} aria-pressed={view === v} className={cn("flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold", view === v ? "bg-foreground text-white" : "text-muted-foreground")}>
                <Icon className="h-4 w-4" />{label}
              </button>
            ))}
          </div>
        )}
      </div>

      {!readOnly && tab === "active" && view === "map" && requests !== null ? (
        <RequestsMap requests={triage} supply={supply} onMatch={onMatch} />
      ) : requests === null ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-64 animate-pulse rounded-[28px] bg-white/60" />)}
        </div>
      ) : (
        <motion.div layout className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {shown.map(({ r, km, canGive }, i) => (
              <RequestCard key={r.id} i={i} r={r} km={km} canGive={canGive} supply={supply[r.id]} response={responses[r.id]} onResponse={(s) => setResponse(r.id, s)} now={now} readOnly={readOnly} onChange={onChange} onMatch={onMatch} />
            ))}
          </AnimatePresence>
          {shown.length === 0 && <p className="col-span-full py-12 text-center font-display text-2xl italic text-muted-foreground">{readOnly && tab === "mine" && feed.length ? "Nothing for your group right now — check All groups." : !readOnly && filter && tab === "active" ? "Nothing matches this filter right now." : "All quiet here."}</p>}
        </motion.div>
      )}

      {!readOnly && <NewRequestDialog open={open} onOpenChange={setOpen} onCreate={(r) => (onChange(r), setTab("active"))} />}
    </motion.div>
  )
}

const span = (ms: number) => { const m = Math.max(1, Math.round(ms / 60000)); return m < 60 ? `${m} min` : m < 2880 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)} days` }
const posted = (ms: number) => { const m = Math.floor(ms / 60000); return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago` }

/** Eligible-donor coverage: red when nobody is within 25 km, amber when 10 km has fewer than two. */
function SupplyLine({ s }: { s: Supply }) {
  const tone = s.within25 === 0 ? "bg-blood-soft text-blood" : s.within10 < 2 ? "bg-amber-50 text-amber-900" : "bg-muted/60 text-muted-foreground"
  const Icon = s.within10 < 2 ? AlertTriangle : Users
  const text =
    s.within25 === 0 ? "No eligible donors within 25 km — escalate to a blood bank"
    : s.within10 === 0 ? `None within 10 km · ${s.within25} within 25 km`
    : `${s.within10} eligible donor${s.within10 === 1 ? "" : "s"} within 10 km${s.within10 < 2 ? ` · ${s.within25} within 25 km` : ""}`
  return <div className={cn("flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium", tone)}><Icon className="h-3.5 w-3.5 shrink-0" />{text}</div>
}

type Filter = "critical" | "verify" | "ready"
const FILTERS: Record<Filter, (r: LiveRequest) => boolean> = {
  critical: (r) => r.urgency === "critical",
  verify: (r) => !r.verified,
  ready: (r) => r.verified,
}
const FILTER_LABEL: Record<Filter, string> = { critical: "critical", verify: "needs verifying", ready: "ready to match" }

function Stat({ i, big, label, tone, active, onClick }: { i: number; big: number | string; label: string; tone: string; active?: boolean; onClick?: () => void }) {
  return (
    <motion.button
      {...popIn(i)}
      type="button"
      disabled={!onClick}
      aria-pressed={onClick ? !!active : undefined}
      onClick={onClick}
      whileHover={onClick ? { y: -3 } : undefined}
      className={cn("rounded-[22px] px-5 py-4 text-left shadow-[0_10px_30px_-16px_hsl(0_60%_40%/0.25)] transition-shadow disabled:cursor-default", tone, active && "ring-2 ring-foreground ring-offset-2 ring-offset-background")}
    >
      <div className="font-display text-3xl font-medium leading-none tabular-nums">{big}</div>
      <div className="mt-1.5 text-sm opacity-80">{label}</div>
    </motion.button>
  )
}

type Tab = "active" | "closed" | "mine" | "all"

export const publicLink = (id: number) => `${location.origin}/r/${id}`

// The link opens a live status page, so a forward read days later says "closed" instead of "urgent".
export async function share(r: LiveRequest, now: number) {
  const hrs = Math.max(1, Math.round((r.expiresAt - now) / 3600_000))
  const text = `${r.group} blood needed: ${r.units} unit${r.units > 1 ? "s" : ""} at ${r.hospital}, ${r.area} (verified, ${requestLabel(r.id)}). Needed within ~${hrs}h. Check it's still needed before forwarding:`
  const url = publicLink(r.id)
  try {
    if (navigator.share) await navigator.share({ title: `${r.group} blood needed`, text, url })
    else (await navigator.clipboard.writeText(`${text} ${url}`), toast.success("Copied — paste it to your family group"))
  } catch (e) {
    if ((e as Error).name !== "AbortError") toast.error("Couldn't share this request")
  }
}

function RequestCard({ r, i, now, km, canGive, supply, response, onResponse, readOnly, onChange, onMatch }: {
  r: LiveRequest; i: number; now: number; km?: number; canGive?: boolean; supply?: Supply; response?: OutreachStatus; onResponse?: (s: OutreachStatus | null) => void
} & Pick<Props, "readOnly" | "onChange" | "onMatch">) {
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const status = statusOf(r, now)
  const isOpen = status === "open"
  // Share of the request's own lifetime left; under an hour is "closing soon" whatever the urgency.
  const left = Math.max(0, Math.min(1, (r.expiresAt - now) / Math.max(1, r.expiresAt - r.createdAt)))
  const soon = r.expiresAt - now < 3600_000

  const act = async (fn: (id: number) => Promise<LiveRequest>, ok: string) => {
    setBusy(true)
    try {
      onChange(await fn(r.id))
      toast.success(ok)
      return true
    } catch (e) {
      toast.error((e as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.article
      layout
      {...popIn(i)}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
      whileHover={isOpen ? { y: -4 } : undefined}
      className={cn("soft-card flex flex-col gap-4 p-5", !isOpen && "opacity-70 saturate-50")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BloodChip group={r.group} />
          <div>
            <div className="font-display text-2xl font-medium">{r.units} unit{r.units > 1 && "s"}</div>
            <div className="text-xs text-muted-foreground">{requestLabel(r.id)} · posted {posted(now - r.createdAt)}</div>
          </div>
        </div>
        {isOpen ? <UrgencyTag u={r.urgency} /> : <StatusTag s={status} />}
      </div>

      <div className="space-y-1.5 text-sm">
        <div className="flex items-center gap-2 font-medium"><Building2 className="h-4 w-4 shrink-0 text-blood/70" /><span className="truncate">{r.hospital}</span></div>
        <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" /><span className="truncate">{r.area}{km !== undefined && ` · ${km} km away`}</span></div>
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <VerifiedTag verified={r.verified} />
          {!readOnly && isOpen && r.responded > 0 && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">✋ {r.responded} raised {r.responded === 1 ? "a hand" : "hands"}</span>}
          {readOnly && canGive === false && <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">Not your blood group</span>}
        </div>
      </div>

      {isOpen && (
        <div>
          <div className="mb-1.5 flex justify-between text-xs">
            <span className={soon ? "font-semibold text-blood" : "text-muted-foreground"}>{soon ? "Closing soon" : "Closes automatically in"}</span>
            <Countdown at={r.expiresAt} now={now} className={cn("font-semibold", soon && "text-blood")} />
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.div className={cn("h-full rounded-full", soon ? "bg-blood" : "bg-[#f2a097]")} animate={{ width: `${left * 100}%` }} transition={{ duration: 0.8 }} />
          </div>
        </div>
      )}

      {!readOnly && isOpen && supply && <SupplyLine s={supply} />}

      {!isOpen && (
        <div className="rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          {status === "fulfilled" ? "Filled" : status === "cancelled" ? "Cancelled" : "Expired"}
          {" "}{posted(now - (status === "expired" ? r.expiresAt : r.closedAt ?? now))}
          {status === "fulfilled" && r.closedAt && <> · took {span(r.closedAt - r.createdAt)}</>}
          {r.donated > 0 && <> · {r.donated} donated</>}
          {r.verifiedBy && <> · verified by {r.verifiedBy}</>}
        </div>
      )}

      {!readOnly && isOpen && r.coming + r.donated + r.unitsReceived > 0 && <Progress req={r} compact />}

      {isOpen && readOnly && (
        <div className="mt-auto space-y-2">
      {canGive && (
        response === "coming" || response === "donated" ? (
          <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-ok">
            <CheckCircle2 className="h-4 w-4" /> {response === "coming" ? "The coordinator is expecting you" : "Thank you for donating!"}
          </div>
        ) : response === "responded" ? (
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-amber-50 px-4 py-2 text-sm">
            <span className="font-medium text-amber-900">✋ You raised your hand</span>
            <button disabled={busy} onClick={() => act(api.withdraw, "Withdrawn").then((ok) => ok && onResponse?.(null))} className="text-xs font-semibold text-muted-foreground hover:text-blood hover:underline">Withdraw</button>
          </div>
        ) : (
          <Btn className="w-full" disabled={busy} onClick={() => act(api.respond, "Thanks! The coordinator can see you raised your hand.").then((ok) => ok && onResponse?.("responded"))}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hand className="h-4 w-4" />} I can come
          </Btn>
        )
      )}

        <Btn variant="soft" className="w-full" onClick={() => share(r, now)}>
          <Share2 className="h-4 w-4" /> Share with family
        </Btn>
        </div>
      )}

      {isOpen && !readOnly && (
        <div className="mt-auto flex gap-2 border-t pt-4">
          {r.verified ? (
            <Btn className="group flex-1" onClick={() => onMatch?.(r.id)}>
              Find donors <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Btn>
          ) : (
            <Btn variant="ok" className="flex-1" disabled={busy} onClick={() => act(api.verify, `${requestLabel(r.id)} verified`)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Verify with hospital
            </Btn>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger disabled={busy} className="grid h-10 w-10 place-items-center rounded-full bg-muted transition-colors hover:bg-secondary" aria-label="More actions">
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-2xl p-1.5">
              <DropdownMenuItem className="rounded-xl" onClick={() => setEditing(true)}>Edit / record units</DropdownMenuItem>
              {r.verified && <DropdownMenuItem className="rounded-xl" onClick={() => navigator.clipboard.writeText(publicLink(r.id)).then(() => toast.success("Public status link copied"))}>Copy public link</DropdownMenuItem>}
              <DropdownMenuItem className="rounded-xl" onClick={() => act(api.fulfill, `${requestLabel(r.id)} fulfilled`)}>Mark as fulfilled</DropdownMenuItem>
              <DropdownMenuItem className="rounded-xl" onClick={() => act(api.cancel, `${requestLabel(r.id)} cancelled`)}>Cancel request</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      {!readOnly && editing && <EditRequestDialog r={r} now={now} open={editing} onOpenChange={setEditing} onSaved={onChange} />}
    </motion.article>
  )
}

function EditRequestDialog({ r, now, open, onOpenChange, onSaved }: { r: LiveRequest; now: number; open: boolean; onOpenChange: (o: boolean) => void; onSaved: (r: LiveRequest) => void }) {
  const [units, setUnits] = useState(r.units)
  const [received, setReceived] = useState(r.unitsReceived)
  const [urgency, setUrgency] = useState<Urgency>(r.urgency)
  const [extendH, setExtendH] = useState(0)
  const [busy, setBusy] = useState(false)
  const expiresAt = r.expiresAt + extendH * 3600_000
  const covered = r.donated + received >= units

  const submit = async () => {
    setBusy(true)
    try {
      const next = await api.updateRequest(r.id, { units, unitsReceived: received, urgency, ...(extendH ? { expiresAt: new Date(expiresAt) } : {}) })
      onSaved(next)
      toast.success(next.status === "fulfilled" ? `${requestLabel(r.id)} is fully covered and closed` : `${requestLabel(r.id)} updated`)
      onOpenChange(false)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[32px] border-0 p-8 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl font-medium">Edit {requestLabel(r.id)}</DialogTitle>
          <DialogDescription>{r.group} at {r.hospital}.{r.donated > 0 && ` ${r.donated} donated through outreach so far.`}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <Stepper label="Units needed" value={units} min={Math.max(1, received)} max={10} onChange={setUnits} />
            <Stepper label="Received elsewhere" hint="blood bank, walk-in" value={received} min={0} max={units} onChange={setReceived} />
          </div>

          <div>
            <div className="mb-2 text-sm font-semibold">Urgency</div>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(WINDOW) as Urgency[]).map((u) => (
                <button key={u} onClick={() => setUrgency(u)} className={cn("rounded-2xl p-3 text-sm font-semibold capitalize ring-2 transition-all", urgency === u ? "bg-blood-soft ring-blood" : "bg-muted ring-transparent hover:bg-secondary")}>{u}</button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-semibold">Extend closing time <span className="font-normal text-muted-foreground">· closes in <Countdown at={expiresAt} now={now} /></span></div>
            <div className="grid grid-cols-4 gap-2">
              {[0, 1, 6, 24].map((h) => (
                <button key={h} onClick={() => setExtendH(h)} className={cn("rounded-2xl p-3 text-sm font-semibold ring-2 transition-all", extendH === h ? "bg-blood-soft ring-blood" : "bg-muted ring-transparent hover:bg-secondary")}>{h ? `+${h} h` : "Keep"}</button>
              ))}
            </div>
          </div>

          {covered && <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-ok">This covers all {units} units, so saving closes the request as fulfilled.</p>}

          <Btn size="lg" className="w-full" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : covered ? "Save and close" : "Save changes"}
          </Btn>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Stepper({ label, hint, value, min, max, onChange }: { label: string; hint?: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div>
      <div className="mb-2 text-sm font-semibold">{label}{hint && <span className="font-normal text-muted-foreground"> · {hint}</span>}</div>
      <div className="flex h-12 w-fit items-center gap-1 rounded-full bg-muted p-1">
        <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} className="h-10 w-10 rounded-full bg-white text-lg shadow-sm disabled:opacity-40" aria-label={`Decrease ${label}`}>−</button>
        <span className="w-8 text-center font-display text-xl font-semibold tabular-nums">{value}</span>
        <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} className="h-10 w-10 rounded-full bg-white text-lg shadow-sm disabled:opacity-40" aria-label={`Increase ${label}`}>+</button>
      </div>
    </div>
  )
}

function NewRequestDialog({ open, onOpenChange, onCreate }: { open: boolean; onOpenChange: (o: boolean) => void; onCreate: (r: LiveRequest) => void }) {
  const [group, setGroup] = useState<Group>("B+")
  const [units, setUnits] = useState(2)
  const [hospital, setHospital] = useState(HOSPITALS[1].name)
  const [urgency, setUrgency] = useState<Urgency>("critical")
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const h = HOSPITALS.find((x) => x.name === hospital)!
    setBusy(true)
    try {
      const r = await api.createRequest({ group, units, hospital: h.name, area: h.area, lat: h.lat, lng: h.lng, urgency, expiresAt: new Date(Date.now() + WINDOW[urgency] * 3600_000) })
      onCreate(r)
      toast.success(`${requestLabel(r.id)} posted`, { description: "Verify it with the hospital before matching donors." })
      onOpenChange(false)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[32px] border-0 p-8 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl font-medium">New request</DialogTitle>
          <DialogDescription>Only what donors need to know — no patient names or diagnosis.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          <div>
            <div className="mb-2 text-sm font-semibold">Blood group</div>
            <div className="grid grid-cols-4 gap-2">
              {GROUPS.map((g) => (
                <button key={g} onClick={() => setGroup(g)} className={cn("relative h-12 rounded-2xl font-display text-lg font-semibold transition-colors", group === g ? "text-white" : "bg-muted hover:bg-secondary")}>
                  {group === g && <motion.span layoutId="grp" transition={SPRING} className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#FF7B72] to-[#C9303F]" />}
                  <span className="relative">{g}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-[auto_1fr] gap-4">
            <div>
              <div className="mb-2 text-sm font-semibold">Units</div>
              <div className="flex h-12 items-center gap-1 rounded-full bg-muted p-1">
                <button onClick={() => setUnits((u) => Math.max(1, u - 1))} className="h-10 w-10 rounded-full bg-white text-lg shadow-sm" aria-label="Fewer units">−</button>
                <span className="w-8 text-center font-display text-xl font-semibold tabular-nums">{units}</span>
                <button onClick={() => setUnits((u) => Math.min(10, u + 1))} className="h-10 w-10 rounded-full bg-white text-lg shadow-sm" aria-label="More units">+</button>
              </div>
            </div>
            <div>
              <div className="mb-2 text-sm font-semibold">Hospital</div>
              <Select value={hospital} onValueChange={setHospital}>
                <SelectTrigger className="h-12 rounded-full border-0 bg-muted px-5"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-2xl">
                  {HOSPITALS.map((h) => <SelectItem key={h.name} value={h.name} className="rounded-xl">{h.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-semibold">Needed within <span className="font-normal text-muted-foreground">— closes automatically after</span></div>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(WINDOW) as Urgency[]).map((u) => (
                <button key={u} onClick={() => setUrgency(u)} className={cn("rounded-2xl p-3 text-left ring-2 transition-all", urgency === u ? "bg-blood-soft ring-blood" : "bg-muted ring-transparent hover:bg-secondary")}>
                  <div className="font-display text-xl font-semibold">{WINDOW[u]} hrs</div>
                  <div className="text-xs capitalize text-muted-foreground">{u}</div>
                </button>
              ))}
            </div>
          </div>

          <Btn size="lg" className="w-full" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post request"}
          </Btn>
        </div>
      </DialogContent>
    </Dialog>
  )
}
