import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { TrendingUp } from "lucide-react"
import { api, type Impact } from "@/api"

const dur = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`)

/** Last-30-day outcomes in one line: what the coordinator desk actually achieved. Refetches when requests change. */
export function ImpactStrip({ refreshKey }: { refreshKey: string }) {
  const [i, setI] = useState<Impact | null>(null)
  useEffect(() => void api.impact().then(setI).catch(() => {}), [refreshKey])
  if (!i) return null

  const items = [
    { n: String(i.filled), l: "requests filled" },
    { n: i.fillRate === null ? "—" : `${i.fillRate}%`, l: "fill rate" },
    { n: i.medianFillMinutes === null ? "—" : dur(i.medianFillMinutes), l: "median time to fill" },
    { n: String(i.unitsArranged), l: "units arranged" },
    { n: String(i.handsRaised), l: "donors raised a hand" },
    { n: `${i.eligibleNow}/${i.donors}`, l: "donors eligible now" },
  ]
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[22px] bg-white/70 px-5 py-3.5 shadow-sm">
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><TrendingUp className="h-4 w-4 text-blood" />Last 30 days</span>
      {items.map((x) => (
        <span key={x.l} className="flex items-baseline gap-1.5">
          <span className="font-display text-xl font-medium tabular-nums">{x.n}</span>
          <span className="text-xs text-muted-foreground">{x.l}</span>
        </span>
      ))}
    </motion.div>
  )
}
