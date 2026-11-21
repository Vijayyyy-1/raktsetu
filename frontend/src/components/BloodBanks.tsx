import { useEffect, useState, type ReactNode } from "react"
import { motion } from "framer-motion"
import { ExternalLink, Navigation, Phone } from "lucide-react"
import { popIn } from "@/components/bits"
import { distanceKm } from "@/api"
import { nearbyBloodBanks, type BloodBank } from "@/places"
import { cn } from "@/lib/utils"

// e-RaktKosh (MoHFW) public pages — no API, so we link out.
export const ERAKTKOSH = {
  camps: "https://eraktkosh.mohfw.gov.in/BLDAHIMS/bloodbank/campSchedule.cnt",
  stock: "https://eraktkosh.mohfw.gov.in/BLDAHIMS/bloodbank/nearbyBBRed.cnt",
}

/** Nearest blood banks (Google Places) with distance, open-now, call and directions. */
export function BloodBanksNear({ at, title, sub, footer, className }: { at: { lat: number; lng: number }; title: ReactNode; sub: ReactNode; footer?: ReactNode; className?: string }) {
  const [banks, setBanks] = useState<BloodBank[] | null>(null)
  useEffect(() => {
    let live = true
    nearbyBloodBanks(at).then((b) => live && setBanks(b)).catch(() => live && setBanks([]))
    return () => void (live = false)
  }, [at.lat, at.lng])

  return (
    <section className={className}>
      <h2 className="text-3xl font-medium">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{sub}</p>
      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
        {banks === null
          ? [0, 1].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/60" />)
          : banks.length === 0
            ? <p className="text-sm text-muted-foreground">Couldn't load nearby blood banks right now.</p>
            : banks.map((b, i) => <BankRow key={b.id} i={i} b={b} from={at} />)}
      </div>
      {footer}
    </section>
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

/** Small outbound link to an e-RaktKosh page. */
export function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-blood hover:underline">
      {children} <ExternalLink className="h-3.5 w-3.5" />
    </a>
  )
}
