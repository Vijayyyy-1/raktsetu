import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowRight, Building2, Loader2, MapPin, MoreHorizontal, Plus, RefreshCw, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BloodChip, Btn, SPRING, SectionHead, StatusTag, UrgencyTag, VerifiedTag, fadeUp, popIn } from "@/components/bits"
import { api, requestLabel, type LiveRequest } from "@/api"
import { GROUPS, HOSPITALS, type Group, type RequestStatus, type Urgency } from "@/data"
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

type Props = {
  requests: LiveRequest[] | null
  now: number
  onChange: (r: LiveRequest) => void
  onRefresh: () => void
  onMatch?: (id: number) => void
  readOnly?: boolean
}

export function Requests({ requests, now, onChange, onRefresh, onMatch, readOnly }: Props) {
  const [tab, setTab] = useState<"active" | "closed">("active")
  const [open, setOpen] = useState(false)
  const all = requests ?? []
  const active = all.filter((r) => statusOf(r, now) === "open")
  // Public feed only shows verified needs; coordinators see everything they must act on.
  const visibleActive = readOnly ? active.filter((r) => r.verified) : active
  const shown = tab === "active" ? visibleActive : all.filter((r) => statusOf(r, now) !== "open")

  return (
    <motion.div {...fadeUp} className="space-y-8">
      <SectionHead
        kicker={readOnly ? "Near you" : "Coordinator desk"}
        title={readOnly ? <>Who needs <span className="italic text-blood">help</span> today</> : <>{active.length} {active.length === 1 ? "request is" : "requests are"} <span className="italic text-blood">open</span></>}
        sub={readOnly ? "Verified requests only — no patient names or diagnoses, ever." : undefined}
      >
        <div className="flex gap-2">
          <Btn variant="ghost" size="lg" onClick={onRefresh} aria-label="Refresh"><RefreshCw className="h-4 w-4" /></Btn>
          {!readOnly && <Btn size="lg" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New request</Btn>}
        </div>
      </SectionHead>

      {!readOnly && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat i={0} big={active.filter((r) => r.urgency === "critical").length} label="critical right now" tone="bg-blood text-white" />
          <Stat i={1} big={active.filter((r) => !r.verified).length} label="need verifying" tone="bg-peach text-[#7a3a14]" />
          <Stat i={2} big={active.filter((r) => r.verified).length} label="ready to match" tone="bg-white" />
          <Stat i={3} big={active.reduce((n, r) => n + r.units, 0)} label="units still needed" tone="bg-emerald-50 text-ok" />
        </div>
      )}

      {!readOnly && (
        <div className="flex w-fit rounded-full bg-white/70 p-1 shadow-sm">
          {(["active", "closed"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn("relative rounded-full px-5 py-2 text-sm font-semibold capitalize", tab !== t && "text-muted-foreground")}>
              {tab === t && <motion.span layoutId="req-tab" transition={SPRING} className="absolute inset-0 rounded-full bg-foreground" />}
              <span className={cn("relative", tab === t && "text-white")}>
                {t === "active" ? `Open · ${active.length}` : `Closed this session · ${all.length - active.length}`}
              </span>
            </button>
          ))}
        </div>
      )}

      {requests === null ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-72 animate-pulse rounded-[28px] bg-white/60" />)}
        </div>
      ) : (
        <motion.div layout className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {shown.map((r, i) => (
              <RequestCard key={r.id} i={i} r={r} now={now} readOnly={readOnly} onChange={onChange} onMatch={onMatch} />
            ))}
          </AnimatePresence>
          {shown.length === 0 && <p className="col-span-full py-16 text-center font-display text-2xl italic text-muted-foreground">All quiet here.</p>}
        </motion.div>
      )}

      {!readOnly && <NewRequestDialog open={open} onOpenChange={setOpen} onCreate={(r) => (onChange(r), setTab("active"))} />}
    </motion.div>
  )
}

function Stat({ i, big, label, tone }: { i: number; big: number | string; label: string; tone: string }) {
  return (
    <motion.div {...popIn(i)} className={cn("rounded-[24px] p-5 shadow-[0_10px_30px_-16px_hsl(0_60%_40%/0.25)]", tone)}>
      <div className="font-display text-4xl font-medium tabular-nums">{big}</div>
      <div className="mt-1 text-sm opacity-80">{label}</div>
    </motion.div>
  )
}

function RequestCard({ r, i, now, readOnly, onChange, onMatch }: { r: LiveRequest; i: number; now: number } & Pick<Props, "readOnly" | "onChange" | "onMatch">) {
  const [busy, setBusy] = useState(false)
  const status = statusOf(r, now)
  const isOpen = status === "open"
  const left = Math.max(0, Math.min(1, (r.expiresAt - now) / (WINDOW[r.urgency] * 3600_000)))

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
            <div className="text-xs text-muted-foreground">{requestLabel(r.id)}</div>
          </div>
        </div>
        {isOpen ? <UrgencyTag u={r.urgency} /> : <StatusTag s={status} />}
      </div>

      <div className="mt-5 space-y-1.5 text-sm">
        <div className="flex items-center gap-2 font-medium"><Building2 className="h-4 w-4 text-blood/70" />{r.hospital}</div>
        <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" />{r.area}</div>
      </div>

      {isOpen && (
        <div className="mt-5">
          <div className="mb-1.5 flex justify-between text-xs">
            <span className="text-muted-foreground">Closes automatically in</span>
            <Countdown at={r.expiresAt} now={now} className={cn("font-semibold", left < 0.3 && "text-blood")} />
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.div className={cn("h-full rounded-full", left < 0.3 ? "bg-blood" : "bg-[#f2a097]")} animate={{ width: `${left * 100}%` }} transition={{ duration: 0.8 }} />
          </div>
        </div>
      )}

      <div className="mt-5"><VerifiedTag verified={r.verified} /></div>

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
