import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowRight, Building2, Loader2, MapPin, MoreHorizontal, Plus, RefreshCw, Share2, ShieldCheck, X } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BloodChip, Btn, SPRING, SectionHead, StatusTag, UrgencyTag, VerifiedTag, fadeUp, popIn } from "@/components/bits"
import { api, distanceKm, requestLabel, type DonorProfile, type LiveRequest } from "@/api"
import { CAN_RECEIVE, GROUPS, HOSPITALS, type Group, type RequestStatus, type Urgency } from "@/data"
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
  return (
    <div className={compact ? "" : "mb-4 rounded-2xl bg-muted/60 p-4"}>
      <div className="mb-1.5 flex justify-between text-xs">
        <span className="text-muted-foreground"><b className="text-ok">{req.donated} donated</b> · <b className="text-blood">{req.coming} coming</b></span>
        <span className="font-semibold">of {req.units} unit{req.units > 1 && "s"}</span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-white">
        <motion.div className="absolute inset-y-0 left-0 rounded-full bg-blood/35" animate={{ width: pct(req.donated + req.coming) }} />
        <motion.div className="absolute inset-y-0 left-0 rounded-full bg-ok" animate={{ width: pct(req.donated) }} />
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
  const [me, setMe] = useState<DonorProfile | null>(null)
  useEffect(() => void (readOnly && api.me().then(setMe).catch((e) => toast.error(e.message))), [readOnly])
  const all = requests ?? []
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
    : (tab === "active" ? triage : all.filter((r) => statusOf(r, now) !== "open")).map((r) => ({ r }))
  const tabs: { id: Tab; label: string }[] = readOnly
    ? [{ id: "mine", label: `You can donate · ${mine.length}` }, { id: "all", label: `All groups · ${feed.length}` }]
    : [{ id: "active", label: `Open · ${active.length}` }, { id: "closed", label: `Closed this session · ${all.length - active.length}` }]

  return (
    <motion.div {...fadeUp} className="space-y-8">
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
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat i={0} big={active.filter(FILTERS.critical).length} label="critical right now" tone="bg-blood text-white" active={filter === "critical"} onClick={() => pickFilter("critical")} />
          <Stat i={1} big={active.filter(FILTERS.verify).length} label="need verifying" tone="bg-peach text-[#7a3a14]" active={filter === "verify"} onClick={() => pickFilter("verify")} />
          <Stat i={2} big={active.filter(FILTERS.ready).length} label="ready to match" tone="bg-white" active={filter === "ready"} onClick={() => pickFilter("ready")} />
          <Stat i={3} big={active.reduce((n, r) => n + r.units, 0)} label="units still needed" tone="bg-emerald-50 text-ok" />
        </div>
      )}

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
      </div>

      {requests === null ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-72 animate-pulse rounded-[28px] bg-white/60" />)}
        </div>
      ) : (
        <motion.div layout className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {shown.map(({ r, km, canGive }, i) => (
              <RequestCard key={r.id} i={i} r={r} km={km} canGive={canGive} now={now} readOnly={readOnly} onChange={onChange} onMatch={onMatch} />
            ))}
          </AnimatePresence>
          {shown.length === 0 && <p className="col-span-full py-16 text-center font-display text-2xl italic text-muted-foreground">{readOnly && tab === "mine" && feed.length ? "Nothing for your group right now — check All groups." : !readOnly && filter && tab === "active" ? "Nothing matches this filter right now." : "All quiet here."}</p>}
        </motion.div>
      )}

      {!readOnly && <NewRequestDialog open={open} onOpenChange={setOpen} onCreate={(r) => (onChange(r), setTab("active"))} />}
    </motion.div>
  )
}

const posted = (ms: number) => { const m = Math.floor(ms / 60000); return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago` }

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
      className={cn("rounded-[24px] p-5 text-left shadow-[0_10px_30px_-16px_hsl(0_60%_40%/0.25)] transition-shadow disabled:cursor-default", tone, active && "ring-2 ring-foreground ring-offset-2 ring-offset-background")}
    >
      <div className="font-display text-4xl font-medium tabular-nums">{big}</div>
      <div className="mt-1 text-sm opacity-80">{label}</div>
    </motion.button>
  )
}

type Tab = "active" | "closed" | "mine" | "all"

async function share(r: LiveRequest, now: number) {
  const hrs = Math.max(1, Math.round((r.expiresAt - now) / 3600_000))
  const text = `${r.group} blood needed: ${r.units} unit${r.units > 1 ? "s" : ""} at ${r.hospital}, ${r.area} (verified, ${requestLabel(r.id)}). Needed within ~${hrs}h. If you can donate, please contact the hospital blood bank.`
  try {
    if (navigator.share) await navigator.share({ title: `${r.group} blood needed`, text, url: location.origin })
    else (await navigator.clipboard.writeText(`${text} ${location.origin}`), toast.success("Copied — paste it to your family group"))
  } catch (e) {
    if ((e as Error).name !== "AbortError") toast.error("Couldn't share this request")
  }
}

function RequestCard({ r, i, now, km, canGive, readOnly, onChange, onMatch }: { r: LiveRequest; i: number; now: number; km?: number; canGive?: boolean } & Pick<Props, "readOnly" | "onChange" | "onMatch">) {
  const [busy, setBusy] = useState(false)
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
    } catch (e) {
      toast.error((e as Error).message)
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
      className={cn("soft-card flex flex-col p-6", !isOpen && "opacity-70 saturate-50")}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <BloodChip group={r.group} />
          <div>
            <div className="font-display text-2xl font-medium">{r.units} unit{r.units > 1 && "s"}</div>
            <div className="text-xs text-muted-foreground">{requestLabel(r.id)} · posted {posted(now - r.createdAt)}</div>
          </div>
        </div>
        {isOpen ? <UrgencyTag u={r.urgency} /> : <StatusTag s={status} />}
      </div>

      <div className="mt-5 space-y-1.5 text-sm">
        <div className="flex items-center gap-2 font-medium"><Building2 className="h-4 w-4 text-blood/70" />{r.hospital}</div>
        <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" />{r.area}{km !== undefined && ` · ${km} km away`}</div>
      </div>

      {isOpen && (
        <div className="mt-5">
          <div className="mb-1.5 flex justify-between text-xs">
            <span className={soon ? "font-semibold text-blood" : "text-muted-foreground"}>{soon ? "Closing soon" : "Closes automatically in"}</span>
            <Countdown at={r.expiresAt} now={now} className={cn("font-semibold", soon && "text-blood")} />
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.div className={cn("h-full rounded-full", soon ? "bg-blood" : "bg-[#f2a097]")} animate={{ width: `${left * 100}%` }} transition={{ duration: 0.8 }} />
          </div>
        </div>
      )}

      {!readOnly && isOpen && r.coming + r.donated > 0 && <div className="mt-4"><Progress req={r} compact /></div>}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <VerifiedTag verified={r.verified} />
        {readOnly && canGive === false && <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">Not your blood group</span>}
      </div>

      {isOpen && readOnly && (
        <Btn variant="soft" className="mt-5 w-full" onClick={() => share(r, now)}>
          <Share2 className="h-4 w-4" /> Share with family
        </Btn>
      )}

      {isOpen && !readOnly && (
        <div className="mt-5 flex gap-2 border-t pt-5">
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
              <DropdownMenuItem className="rounded-xl" onClick={() => act(api.fulfill, `${requestLabel(r.id)} fulfilled`)}>Mark as fulfilled</DropdownMenuItem>
              <DropdownMenuItem className="rounded-xl" onClick={() => act(api.cancel, `${requestLabel(r.id)} cancelled`)}>Cancel request</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </motion.article>
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
