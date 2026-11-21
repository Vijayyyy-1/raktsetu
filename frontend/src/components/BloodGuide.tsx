import { useState, type ReactNode } from "react"
import { motion } from "framer-motion"
import { ArrowDownLeft, ArrowUpRight, HelpCircle } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { SPRING } from "@/components/bits"
import { CAN_RECEIVE, GROUPS, type Group } from "@/data"
import { cn } from "@/lib/utils"

// Inverse of CAN_RECEIVE: which recipients a donor group can give red cells to.
const CAN_GIVE = Object.fromEntries(GROUPS.map((d) => [d, GROUPS.filter((r) => CAN_RECEIVE[r].includes(d))])) as Record<Group, Group[]>

/** "?" button that opens a blood-group compatibility guide. */
export function BloodGuide({ initial = "B+", label, className }: { initial?: Group; label?: string; className?: string }) {
  const [g, setG] = useState<Group>(initial)

  return (
    <Dialog>
      <DialogTrigger
        className={cn("inline-flex items-center gap-1.5 rounded-full text-sm font-semibold text-muted-foreground transition-colors hover:text-blood", !label && "grid h-9 w-9 place-items-center hover:bg-blood-soft", className)}
        aria-label="Blood group compatibility guide"
        title="Who can give to whom?"
      >
        <HelpCircle className="h-5 w-5" />
        {label}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[32px] border-0 p-6 sm:max-w-xl sm:p-8">
        <DialogHeader>
          <p className="text-sm font-semibold text-blood">Know your blood</p>
          <DialogTitle className="font-display text-3xl font-medium">Who can give to whom?</DialogTitle>
          <DialogDescription>Pick a blood group to see who it can help and who can help it.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-2 pt-2">
          {GROUPS.map((x) => (
            <button key={x} onClick={() => setG(x)} className={cn("relative h-12 rounded-2xl font-display text-lg font-semibold transition-colors", g === x ? "text-white" : "bg-muted hover:bg-secondary")}>
              {g === x && <motion.span layoutId="guide-grp" transition={SPRING} className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#FF7B72] to-[#C9303F]" />}
              <span className="relative">{x}</span>
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Panel icon={<ArrowUpRight className="h-4 w-4" />} title={`${g} can give to`} groups={CAN_GIVE[g]} tone="bg-blood-soft text-blood" />
          <Panel icon={<ArrowDownLeft className="h-4 w-4" />} title={`${g} can receive from`} groups={CAN_RECEIVE[g]} tone="bg-emerald-50 text-ok" />
        </div>

        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <Fact big="O−" text="Universal donor — can give red cells to anyone. Keep these donors close!" />
          <Fact big="AB+" text="Universal recipient — can receive red cells from every group." />
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          This is for red-cell transfusions. Plasma and platelets follow different rules, and the blood bank always cross-matches before a transfusion.
        </p>
      </DialogContent>
    </Dialog>
  )
}

function Panel({ icon, title, groups, tone }: { icon: ReactNode; title: string; groups: Group[]; tone: string }) {
  return (
    <div className={cn("rounded-2xl p-4", tone)}>
      <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold">{icon}{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {groups.map((x, i) => (
          <motion.span key={`${title}-${x}`} initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...SPRING, delay: i * 0.03 }} className="rounded-xl bg-white px-2.5 py-1 font-display font-semibold text-foreground shadow-sm">
            {x}
          </motion.span>
        ))}
      </div>
      <div className="mt-2 text-xs opacity-80">{groups.length === 8 ? "Everyone" : `${groups.length} of 8 groups`}</div>
    </div>
  )
}

function Fact({ big, text }: { big: string; text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-muted p-3">
      <span className="font-display text-xl font-semibold text-blood">{big}</span>
      <span className="text-muted-foreground">{text}</span>
    </div>
  )
}

// Self-check: O- gives to all, AB+ gives only to AB+.
if (import.meta.env.DEV) console.assert(CAN_GIVE["O-"].length === 8 && CAN_GIVE["AB+"].join() === "AB+", "CAN_GIVE derivation broken")
