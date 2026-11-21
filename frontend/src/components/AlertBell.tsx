import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "framer-motion"
import { Bell, BellRing, MapPin } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BloodChip, Btn, UrgencyTag } from "@/components/bits"
import { api, requestLabel } from "@/api"

const POLL_MS = 30_000
const canNotify = typeof window !== "undefined" && "Notification" in window

/**
 * Donor alerts: verified requests nearby that this donor can actually answer (the API filters by group, distance,
 * availability and eligibility). Badge for unread; a desktop notification for new ones while the app is open.
 */
export function AlertBell({ onOpenRequests }: { onOpenRequests: () => void }) {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ["alerts"], queryFn: api.alerts, refetchInterval: POLL_MS })
  const alerts = data?.alerts ?? []
  const unread = data?.unread ?? 0
  const seen = useMutation({
    mutationFn: api.markAlertsSeen,
    // Clears the badge only; the dots on each row stay until the next poll so the donor can see what was new.
    onSuccess: () => qc.setQueryData(["alerts"], (d: typeof data) => d && { ...d, unread: 0 }),
  })
  const [open, setOpen] = useState(false)
  const [perm, setPerm] = useState(canNotify ? Notification.permission : "denied")
  const known = useRef<Set<number> | null>(null) // ids seen on the previous poll; null until the first load

  useEffect(() => {
    if (!data) return
    const fresh = data.alerts.filter((x) => x.unread && known.current && !known.current.has(x.id))
    if (canNotify && Notification.permission === "granted")
      fresh.forEach((x) => new Notification(`${x.group} needed · ${x.km} km away`, { body: `${x.hospital} · ${x.units} unit${x.units > 1 ? "s" : ""}. Open RaktSetu to raise your hand.`, tag: `rq-${x.id}` }))
    known.current = new Set(data.alerts.map((x) => x.id))
  }, [data])

  const toggle = (o: boolean) => {
    setOpen(o)
    if (o && unread) seen.mutate()
  }

  return (
    <Popover open={open} onOpenChange={toggle}>
      <PopoverTrigger className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label={unread ? `${unread} new alerts` : "Alerts"}>
        {unread ? <BellRing className="h-5 w-5 text-blood" /> : <Bell className="h-5 w-5" />}
        <AnimatePresence>
          {unread > 0 && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-blood px-1 text-[11px] font-bold text-white ring-2 ring-white">
              {unread}
            </motion.span>
          )}
        </AnimatePresence>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,360px)] rounded-2xl p-2">
        <div className="px-2 pb-2 pt-1">
          <div className="font-semibold">Requests you can answer</div>
          <div className="text-xs text-muted-foreground">Verified, your blood group, within 15 km. Paused or resting donors get none.</div>
        </div>
        {alerts.length === 0 ? (
          <p className="rounded-xl bg-muted/60 p-4 text-center text-sm text-muted-foreground">Nothing right now. We'll only ping you when you can really help.</p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {alerts.map((a) => (
              <li key={a.id}>
                <button onClick={() => (setOpen(false), onOpenRequests())} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-muted">
                  <BloodChip group={a.group} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 truncate text-sm font-semibold">{a.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-blood" />}{a.hospital}</span>
                    <span className="flex items-center gap-1 truncate text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{a.km} km · {a.units} unit{a.units > 1 && "s"} · {requestLabel(a.id)}</span>
                  </span>
                  <UrgencyTag u={a.urgency} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {canNotify && perm === "default" && (
          <Btn variant="soft" className="mt-2 w-full text-xs" onClick={() => Notification.requestPermission().then(setPerm)}>
            <BellRing className="h-3.5 w-3.5" /> Also alert me on this device
          </Btn>
        )}
      </PopoverContent>
    </Popover>
  )
}
