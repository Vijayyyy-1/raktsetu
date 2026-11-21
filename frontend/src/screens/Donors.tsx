import { useEffect, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronLeft, ChevronRight, Loader2, Lock, MoreHorizontal, Search, ShieldOff, ShieldCheck, Sparkles, X } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { BloodChip, Btn, SPRING, SectionHead, fadeUp, popIn } from "@/components/bits"
import { api, type RegistryDonor, type RegistryStats, type RegistryStatus } from "@/api"
import type { Group } from "@/data"
import { cn } from "@/lib/utils"

const PAGE = 20
// Short = nobody ready, or under half ready in a group big enough to judge (rare groups like AB− are always small).
const isShort = (g: { total: number; eligible: number }) => g.eligible === 0 || (g.total >= 3 && g.eligible / g.total < 0.5)

const STATUS: Record<RegistryStatus, { label: string; tone: string }> = {
  eligible: { label: "Ready", tone: "bg-emerald-50 text-ok" },
  soon: { label: "Ready soon", tone: "bg-amber-50 text-amber-700" },
  resting: { label: "Resting", tone: "bg-muted text-muted-foreground" },
  paused: { label: "Paused", tone: "bg-muted text-muted-foreground" },
  inactive: { label: "Deactivated", tone: "bg-blood-soft text-blood" },
}
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" })

export function Donors() {
  const [stats, setStats] = useState<RegistryStats | null>(null)
  const [q, setQ] = useState("")
  const [query, setQuery] = useState("") // debounced
  const [group, setGroup] = useState<Group | undefined>()
  const [community, setCommunity] = useState<string | undefined>()
  const [status, setStatus] = useState<RegistryStatus | undefined>()
  const [page, setPage] = useState(1)
  const [list, setList] = useState<{ total: number; items: RegistryDonor[] } | null>(null)
  const [confirm, setConfirm] = useState<RegistryDonor | null>(null)
  const [busy, setBusy] = useState(false)

  const loadStats = () => api.registryStats().then(setStats).catch((e) => toast.error(e.message))
  useEffect(() => void loadStats(), [])
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])
  useEffect(() => setPage(1), [query, group, community, status])
  useEffect(() => {
    let live = true
    api.registry({ q: query, group, community, status, page, pageSize: PAGE })
      .then((r) => live && setList(r))
      .catch((e) => live && (toast.error(e.message), setList({ total: 0, items: [] })))
    return () => void (live = false)
  }, [query, group, community, status, page])

  const toggleActive = async (d: RegistryDonor) => {
    setBusy(true)
    try {
      const updated = await api.setDonorActive(d.id, d.status === "inactive")
      setList((l) => l && { ...l, items: l.items.map((x) => (x.id === d.id ? updated : x)) })
      toast.success(updated.status === "inactive" ? `${d.name} deactivated` : `${d.name} reactivated`, { description: updated.status === "inactive" ? "They can't sign in and won't be matched." : undefined })
      setConfirm(null)
      loadStats()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const filtered = !!(query || group || community || status)
  const pages = list ? Math.max(1, Math.ceil(list.total / PAGE)) : 1

  return (
    <motion.div {...fadeUp} className="space-y-8">
      <SectionHead
        kicker="Donor registry"
        title={stats ? <>{stats.total} donors, <span className="italic text-blood">{stats.eligibleNow} ready</span></> : "Donors"}
        sub={<span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" />No phone numbers or exact locations here. Contact donors through a request's matches.</span>}
      />

      {/* Summary */}
      {stats && (
        <div className="flex flex-wrap gap-2">
          <Chip tone="bg-emerald-50 text-ok" n={stats.eligibleNow} label="ready now" onClick={() => setStatus("eligible")} />
          <Chip tone="bg-amber-50 text-amber-700" n={stats.soon} label="ready within 14 days" onClick={() => setStatus("soon")} />
          <Chip tone="bg-white" n={stats.firstTimers} label="first-timers" icon={<Sparkles className="h-3.5 w-3.5 text-blood" />} />
          <Chip tone="bg-white" n={stats.paused} label="paused alerts" onClick={() => setStatus("paused")} />
          {stats.inactive > 0 && <Chip tone="bg-blood-soft text-blood" n={stats.inactive} label="deactivated" onClick={() => setStatus("inactive")} />}
        </div>
      )}

      {/* Supply by blood group */}
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-2xl font-medium">Supply by blood group</h2>
          <span className="text-xs text-muted-foreground">ready now / registered · tap a group to filter the list</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {(stats?.byGroup ?? []).map((g, i) => {
            const short = isShort(g)
            return (
              <motion.button key={g.group} {...popIn(i)} onClick={() => setGroup(group === g.group ? undefined : g.group)} aria-pressed={group === g.group}
                className={cn("relative flex items-center gap-3 rounded-2xl p-3 text-left shadow-[0_10px_30px_-16px_hsl(0_60%_40%/0.25)] ring-2 transition-all", short ? "bg-blood-soft" : "bg-white", group === g.group ? "ring-foreground" : "ring-transparent hover:ring-blood/20")}>
                {short && <span className="pill absolute -top-2 right-2 bg-blood px-2 py-0 text-[10px] text-white">Short</span>}
                <BloodChip group={g.group} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="font-display text-2xl font-medium leading-none tabular-nums">{g.eligible}<span className="text-sm text-muted-foreground">/{g.total}</span></div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                    <motion.div className="h-full rounded-full bg-gradient-to-r from-[#FF7B72] to-[#C9303F]" initial={{ width: 0 }} animate={{ width: `${g.total ? (g.eligible / g.total) * 100 : 0}%` }} transition={SPRING} />
                  </div>
                </div>
              </motion.button>
            )
          })}
          {!stats && [0, 1, 2, 3, 4, 5, 6, 7].map((i) => <div key={i} className="h-[60px] animate-pulse rounded-2xl bg-white/60" />)}
        </div>
      </section>

      {/* Communities */}
      {stats && stats.byCommunity.length > 0 && (
        <section>
          <h2 className="mb-3 text-2xl font-medium">Communities</h2>
          <div className="flex flex-wrap gap-2">
            {stats.byCommunity.map((c) => (
              <button key={c.community} onClick={() => setCommunity(community === c.community ? undefined : c.community)}
                className={cn("rounded-full px-4 py-2 text-sm shadow-sm transition-colors", community === c.community ? "bg-foreground text-white" : "bg-white hover:bg-secondary")}>
                <span className="font-semibold">{c.community}</span>
                <span className={cn("ml-2", community === c.community ? "text-white/70" : "text-muted-foreground")}>{c.eligible} ready · {c.total}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* List */}
      <section className="soft-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, area or community" aria-label="Search donors"
              className="h-11 w-full rounded-full bg-muted pl-11 pr-4 text-sm outline-none focus:ring-4 focus:ring-blood/10" />
          </div>
          <div className="flex flex-wrap gap-1 rounded-full bg-muted p-1">
            {([undefined, "eligible", "soon", "resting", "paused", "inactive"] as const).map((s) => (
              <button key={s ?? "all"} onClick={() => setStatus(s)} className={cn("relative rounded-full px-3 py-1.5 text-xs font-semibold", status === s ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {status === s && <motion.span layoutId="reg-status" transition={SPRING} className="absolute inset-0 rounded-full bg-white shadow-sm" />}
                <span className="relative">{s ? STATUS[s].label : "All"}</span>
              </button>
            ))}
          </div>
        </div>

        {filtered && (
          <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2 text-xs">
            <span className="text-muted-foreground">Filtered:</span>
            {group && <Tag onClear={() => setGroup(undefined)}>{group}</Tag>}
            {community && <Tag onClear={() => setCommunity(undefined)}>{community}</Tag>}
            {status && <Tag onClear={() => setStatus(undefined)}>{STATUS[status].label}</Tag>}
            {query && <Tag onClear={() => setQ("")}>“{query}”</Tag>}
          </div>
        )}

        {list === null ? (
          <div className="space-y-2 p-4">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-14 animate-pulse rounded-2xl bg-muted" />)}</div>
        ) : list.items.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">No donors match these filters.</p>
        ) : (
          <ul className="divide-y">
            <AnimatePresence initial={false}>
              {list.items.map((d) => (
                <motion.li key={d.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className={cn("flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-blood-soft/30", d.status === "inactive" && "opacity-60")}>
                  <BloodChip group={d.group} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 truncate font-semibold">
                      {d.name}
                      {d.firstTimer && <span className="pill shrink-0 bg-blood-soft py-0.5 text-[10px] text-blood">First-timer</span>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{[d.community, d.area].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div className="hidden w-40 text-right sm:block">
                    <span className={cn("pill", STATUS[d.status].tone)}>{STATUS[d.status].label}</span>
                    {d.nextEligibleAt && <div className="mt-1 text-[11px] text-muted-foreground">from {fmtDate(d.nextEligibleAt)}</div>}
                  </div>
                  <div className="hidden w-20 text-right text-sm md:block"><b>{d.donations}</b> <span className="text-xs text-muted-foreground">gave</span></div>
                  <div className="hidden w-24 text-right text-xs text-muted-foreground lg:block">joined {fmtDate(d.joinedAt)}</div>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-muted" aria-label={`Actions for ${d.name}`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-2xl p-1.5">
                      <DropdownMenuItem className="rounded-xl" onClick={() => setConfirm(d)}>
                        {d.status === "inactive" ? <><ShieldCheck className="mr-2 h-4 w-4 text-ok" />Reactivate account</> : <><ShieldOff className="mr-2 h-4 w-4 text-blood" />Deactivate account</>}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}

        {list && list.total > PAGE && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground">{(page - 1) * PAGE + 1}–{Math.min(page * PAGE, list.total)} of {list.total}</span>
            <div className="flex gap-1">
              <Btn variant="ghost" className="h-9 w-9 px-0" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Btn>
              <Btn variant="ghost" className="h-9 w-9 px-0" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Btn>
            </div>
          </div>
        )}
      </section>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="rounded-[32px] border-0 p-8">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-medium">{confirm?.status === "inactive" ? `Reactivate ${confirm?.name}?` : `Deactivate ${confirm?.name}?`}</DialogTitle>
            <DialogDescription>
              {confirm?.status === "inactive"
                ? "They'll be able to sign in again and will be matched to requests."
                : "Use this for fake or abusive sign-ups. They won't be able to sign in or be matched. Their history is kept, and you can reactivate them later."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setConfirm(null)}>Cancel</Btn>
            <Btn variant={confirm?.status === "inactive" ? "ok" : "primary"} disabled={busy} onClick={() => confirm && toggleActive(confirm)}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}{confirm?.status === "inactive" ? "Reactivate" : "Deactivate"}
            </Btn>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}

function Chip({ n, label, tone, icon, onClick }: { n: number; label: string; tone: string; icon?: ReactNode; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div"
  return (
    <Tag onClick={onClick} className={cn("flex items-center gap-2 rounded-full px-4 py-2 text-sm shadow-sm", tone, onClick && "transition-transform hover:-translate-y-0.5")}>
      {icon}<b className="font-display text-lg font-semibold tabular-nums">{n}</b> {label}
    </Tag>
  )
}

function Tag({ children, onClear }: { children: ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 font-semibold shadow-sm">
      {children}
      <button onClick={onClear} aria-label="Clear filter" className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
    </span>
  )
}
