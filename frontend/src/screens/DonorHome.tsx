import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { BellRing, Building2, CalendarDays, CalendarHeart, Loader2, MapPin, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { Switch } from "@/components/ui/switch"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BloodChip, Btn, EstimateNote, SPRING, SectionHead, fadeUp, popIn } from "@/components/bits"
import { api, distanceKm, requestLabel, type DonorProfile, type Eligibility, type LiveRequest } from "@/api"
import { CAN_RECEIVE, MONTHLY_SUPPLY } from "@/data"
import { Countdown, statusOf } from "./Requests"
import { cn } from "@/lib/utils"

const DAY = 864e5

export function DonorHome({ requests, now }: { requests: LiveRequest[] | null; now: number }) {
  const [me, setMe] = useState<DonorProfile | null>(null)
  const [elig, setElig] = useState<Eligibility | null>(null)
  const [saving, setSaving] = useState(false)
  const [day, setDay] = useState<Date | undefined>(() => new Date())
  const [pickOpen, setPickOpen] = useState(false)

  const load = () => Promise.all([api.me(), api.eligibility()]).then(([m, e]) => (setMe(m), setElig(e)))
  useEffect(() => void load().catch((e) => toast.error(e.message)), [])

  const save = async (patch: Parameters<typeof api.updateMe>[0], ok?: string) => {
    setSaving(true)
    try {
      setMe(await api.updateMe(patch))
      setElig(await api.eligibility())
      if (ok) toast.success(ok)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!me || !elig) return <div className="grid h-[60vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-blood" /></div>

  const first = me.name.replace(/\(.*?\)/g, "").trim().split(" ")[0]
  const last = me.lastDonationAt ? Date.parse(me.lastDonationAt) : null
  const next = elig.nextEligibleAt ? Date.parse(elig.nextEligibleAt) : null
  const daysSince = last ? Math.floor((now - last) / DAY) : null
  const daysLeft = next ? Math.max(0, Math.ceil((next - now) / DAY)) : null
  const progress = last && next ? Math.min(1, (now - last) / (next - last)) : 0

  // Open, verified requests this donor's blood can serve, nearest first.
  const nearby = (requests ?? [])
    .filter((r) => statusOf(r, now) === "open" && r.verified && CAN_RECEIVE[r.group].includes(me.group))
    .map((r) => ({ r, km: Math.round(distanceKm(me.lat, me.lng, r.lat, r.lng) * 10) / 10 }))
    .sort((a, b) => a.km - b.km)
  const top = nearby[0]

  return (
    <motion.div {...fadeUp} className="space-y-6">
      <SectionHead kicker={`Hi ${first}`} title={elig.eligible ? <>You're <span className="italic text-blood">ready</span> to give</> : last ? <>Resting up, <span className="italic text-blood">hero</span></> : <>Welcome to the <span className="italic text-blood">registry</span></>} />

      {top && me.available && elig.eligible && (
        <motion.div initial={{ opacity: 0, y: -20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={SPRING} className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#FF7B72] via-[#E04848] to-[#B02A3E] p-6 text-white shadow-[0_24px_50px_-20px_hsl(0_70%_45%/0.7)] sm:p-8">
          {[0, 1].map((i) => (
            <motion.span key={i} className="absolute right-10 top-10 h-16 w-16 rounded-full border-2 border-white/40" animate={{ scale: [1, 3.2], opacity: [0.6, 0] }} transition={{ repeat: Infinity, duration: 2.4, delay: i * 1.2 }} />
          ))}
          <div className="relative flex flex-wrap items-center gap-6">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/20 backdrop-blur"><BellRing className="h-6 w-6" /></div>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-white/80">You're a match · closes in <Countdown at={top.r.expiresAt} now={now} /></div>
              <div className="mt-1 font-display text-3xl font-medium">{top.r.group} needed at {top.r.hospital}</div>
              <div className="mt-2 flex flex-wrap gap-4 text-sm text-white/85">
                <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{top.km} km from you</span>
                <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" />Verified by a coordinator</span>
              </div>
            </div>
            <p className="max-w-[16rem] text-sm text-white/85">Stay available — the coordinator will call you if you're on their list.</p>
          </div>
        </motion.div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        <motion.div {...popIn(0)} className="soft-card p-7">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-medium">Your rhythm</h2>
              <p className="text-sm text-muted-foreground">{daysSince === null ? "No donation recorded yet" : daysSince === 0 ? "You gave today" : `Last gave ${daysSince} days ago`} · {me.area}</p>
            </div>
            <BloodChip group={me.group} />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-8">
            <Ring progress={progress} ready={elig.eligible} label={elig.eligible ? "Ready" : daysLeft !== null ? `${daysLeft}d` : "—"} />
            <div className="max-w-[16rem] space-y-2">
              <div className="font-display text-lg font-medium leading-tight">
                {elig.eligible ? "You can give now" : next ? `Likely ready ${new Date(next).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}` : "Add your last donation date"}
              </div>
              <div className="text-xs text-muted-foreground">{elig.reason}</div>
            </div>
          </div>

          <div className="mt-7 flex items-center justify-between rounded-2xl bg-muted p-4">
            <div>
              <div className="font-semibold">Open to requests</div>
              <div className="text-xs text-muted-foreground">Pause any time — exams, travel, feeling unwell.</div>
            </div>
            <Switch checked={me.available} disabled={saving} onCheckedChange={(v) => save({ available: v }, v ? "You're back on the list" : "Paused — we won't match you")} />
          </div>
          <div className="mt-3 flex gap-2">
            <Popover open={pickOpen} onOpenChange={setPickOpen}>
              <PopoverTrigger asChild>
                <button type="button" aria-label="Donation date" className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-full border border-input bg-white px-4 text-sm transition-colors hover:border-blood/40">
                  <CalendarDays className="h-4 w-4 shrink-0 text-blood" />
                  <span className="truncate">{day ? day.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Pick a date"}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto rounded-2xl p-0">
                <Calendar mode="single" selected={day} defaultMonth={day} captionLayout="dropdown" startMonth={new Date(2000, 0)} endMonth={new Date()} disabled={{ after: new Date() }} onSelect={(d) => (setDay(d), setPickOpen(false))} />
              </PopoverContent>
            </Popover>
            <Btn variant="soft" size="lg" disabled={saving || !day} onClick={() => day && save({ lastDonationAt: day.toISOString() }, "Thank you! We'll stay quiet while you recover.")}>
              <CalendarHeart className="h-4 w-4" /> I donated
            </Btn>
          </div>
          <EstimateNote className="mt-4" />
        </motion.div>

        <motion.div {...popIn(1)} className="soft-card p-7">
          <h2 className="text-2xl font-medium">Open requests you can help with</h2>
          <p className="text-sm text-muted-foreground">Verified needs that {me.group} blood can serve, nearest first.</p>
          {requests === null ? (
            <div className="mt-6 h-24 animate-pulse rounded-2xl bg-muted" />
          ) : nearby.length === 0 ? (
            <p className="mt-6 rounded-2xl bg-muted p-5 text-sm text-muted-foreground">Nothing right now. We'll keep your spot warm.</p>
          ) : (
            <ul className="mt-5 space-y-2">
              {nearby.slice(0, 4).map(({ r, km }) => (
                <li key={r.id} className="flex items-center gap-4 rounded-2xl bg-muted/60 p-3">
                  <BloodChip group={r.group} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate font-semibold"><Building2 className="h-3.5 w-3.5 text-blood/70" />{r.hospital}</div>
                    <div className="text-xs text-muted-foreground">{requestLabel(r.id)} · {r.units} units · {km} km</div>
                  </div>
                  <Countdown at={r.expiresAt} now={now} className="text-xs font-semibold text-blood" />
                </li>
              ))}
            </ul>
          )}

          <h3 className="mt-8 text-lg font-medium">When supply runs low</h3>
          <div className="mt-4 flex h-32 items-end gap-1.5">
            {MONTHLY_SUPPLY.map((m, i) => (
              <div key={m.m} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <motion.div
                  className={cn("w-full rounded-full", m.v < 75 ? "bg-gradient-to-t from-[#C9303F] to-[#FF7B72]" : "bg-secondary", i === new Date().getMonth() && "outline outline-2 outline-offset-2 outline-foreground/70")}
                  initial={{ height: 0 }}
                  animate={{ height: `${(m.v / 110) * 100}%` }}
                  transition={{ ...SPRING, delay: 0.2 + i * 0.04 }}
                  title={`${m.m}: ${m.v}% of need`}
                />
                <span className="text-[10px] text-muted-foreground">{m.m}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Illustrative: donations dip in summer and festival months — that's when giving matters most.</p>
        </motion.div>
      </div>
    </motion.div>
  )
}

function Ring({ progress, ready, label }: { progress: number; ready: boolean; label: string }) {
  const c = 2 * Math.PI * 50
  return (
    <div className="relative h-40 w-40">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <defs><linearGradient id="g1"><stop offset="0%" stopColor="#FF7B72" /><stop offset="100%" stopColor="#C9303F" /></linearGradient></defs>
        <circle cx="60" cy="60" r="50" fill="none" stroke="hsl(6 85% 95%)" strokeWidth="11" />
        <motion.circle cx="60" cy="60" r="50" fill="none" stroke={ready ? "hsl(158 36% 40%)" : "url(#g1)"} strokeWidth="11" strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.max(progress, 0.02)) }} transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center font-display text-2xl font-medium">{label}</div>
    </div>
  )
}
