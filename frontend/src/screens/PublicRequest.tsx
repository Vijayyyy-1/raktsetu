import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Ban, Building2, CheckCircle2, Clock3, HeartHandshake, Loader2, MapPin, Share2, ShieldCheck } from "lucide-react"
import { Toaster } from "@/components/ui/sonner"
import { BloodChip, Btn, Logo, SPRING, UrgencyTag } from "@/components/bits"
import { api, requestLabel, type LiveRequest } from "@/api"
import { Countdown, share } from "./Requests"
import { cn } from "@/lib/utils"

/** What someone sees when they open a forwarded request link: is it still needed, right now? No login. */
export function PublicRequest({ id }: { id: number }) {
  const [r, setR] = useState<LiveRequest | null | "missing">(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const load = () => api.requestStatus(id).then(setR).catch(() => setR("missing"))
    load()
    const poll = setInterval(load, 30_000) // a closed request should flip while the page is open
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => (clearInterval(poll), clearInterval(tick))
  }, [id])

  const open = r && r !== "missing" && r.status === "open" && r.expiresAt > now

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col px-4 py-5">
      <Toaster position="bottom-center" toastOptions={{ className: "!rounded-2xl !border-0 !shadow-xl font-sans" }} />
      <a href="/" className="w-fit"><Logo /></a>

      <div className="flex flex-1 flex-col justify-center py-8">
        {r === null ? (
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-blood" />
        ) : r === "missing" ? (
          <Card tone="muted" icon={<Ban className="h-7 w-7" />} title="We couldn't find this request" body="The link may be wrong, or the request was never verified. Please don't forward it." />
        ) : (
          <>
            <Card
              tone={open ? "open" : r.status === "fulfilled" ? "done" : "muted"}
              icon={open ? <Clock3 className="h-7 w-7" /> : r.status === "fulfilled" ? <CheckCircle2 className="h-7 w-7" /> : <Ban className="h-7 w-7" />}
              title={open ? "Still needed" : r.status === "fulfilled" ? "Need met, thank you" : r.status === "cancelled" ? "This request was cancelled" : "This request has closed"}
              body={open
                ? <>Closes automatically in <Countdown at={r.expiresAt} now={now} className="font-semibold" />. Verified by a coordinator with the hospital.</>
                : <>Please <b>stop forwarding</b> this message. {r.status === "fulfilled" ? "The patient got the blood they needed." : "It's no longer active."}</>}
            />

            <div className="soft-card mt-4 flex items-center gap-4 p-5">
              <BloodChip group={r.group} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-2xl font-medium">{r.units} unit{r.units > 1 && "s"} of {r.group}</span>
                  {open && <UrgencyTag u={r.urgency} />}
                </div>
                <div className="mt-1 flex items-center gap-1.5 truncate text-sm"><Building2 className="h-4 w-4 shrink-0 text-blood/70" />{r.hospital}</div>
                <div className="flex items-center gap-1.5 truncate text-sm text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" />{r.area} · {requestLabel(r.id)}</div>
              </div>
            </div>

            {open && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Btn size="lg" onClick={() => (location.href = "/")}><HeartHandshake className="h-4 w-4" /> I can donate</Btn>
                <Btn size="lg" variant="soft" onClick={() => share(r, now)}><Share2 className="h-4 w-4" /> Share</Btn>
              </div>
            )}
            <p className="mt-4 flex items-start gap-2 px-1 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              No patient names or diagnoses are ever shown. Donors sign in to raise their hand; the coordinator contacts them directly.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function Card({ tone, icon, title, body }: { tone: "open" | "done" | "muted"; icon: React.ReactNode; title: string; body: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}
      className={cn("rounded-[28px] p-6 text-center", tone === "open" ? "bg-blood text-white" : tone === "done" ? "bg-emerald-50 text-ok" : "bg-muted text-foreground")}>
      <div className={cn("mx-auto grid h-14 w-14 place-items-center rounded-full", tone === "open" ? "bg-white/20" : "bg-white")}>{icon}</div>
      <h1 className="mt-3 font-display text-3xl font-medium">{title}</h1>
      <p className={cn("mt-2 text-sm", tone === "open" ? "text-white/90" : "text-muted-foreground")}>{body}</p>
    </motion.div>
  )
}
