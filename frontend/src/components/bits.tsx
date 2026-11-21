import type { ButtonHTMLAttributes, ReactNode } from "react"
import { motion } from "framer-motion"
import { Check, Clock3 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Group, RequestStatus, Urgency } from "@/data"

export const SPRING = { type: "spring", stiffness: 260, damping: 26 } as const

/** Signature mark: a soft, breathing blood drop. */
export function Drop({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <div className={cn("relative", className)}>
      <motion.svg viewBox="0 0 100 120" className="h-full w-full drop-shadow-[0_18px_30px_hsl(0_70%_50%/0.35)]" animate={{ scale: [1, 1.035, 1], rotate: [0, -1.5, 0] }} transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}>
        <defs>
          <radialGradient id="dropg" cx="35%" cy="60%" r="75%">
            <stop offset="0%" stopColor="#FF8A80" />
            <stop offset="55%" stopColor="#E04848" />
            <stop offset="100%" stopColor="#A8243A" />
          </radialGradient>
        </defs>
        <path d="M50 4C38 26 12 52 12 76a38 38 0 0 0 76 0C88 52 62 26 50 4Z" fill="url(#dropg)" />
        <ellipse cx="34" cy="74" rx="7" ry="13" fill="white" opacity="0.35" transform="rotate(18 34 74)" />
      </motion.svg>
      {children && <div className="absolute inset-0 grid place-items-center pt-[22%]">{children}</div>}
    </div>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Drop className="h-7 w-6" />
      <span className="font-display text-[22px] font-semibold tracking-tight">raktsetu</span>
    </div>
  )
}

export function BloodChip({ group, size = "md", className }: { group: Group; size?: "sm" | "md" | "lg"; className?: string }) {
  const s = { sm: "h-9 w-9 text-xs rounded-xl", md: "h-14 w-14 text-lg rounded-2xl", lg: "h-24 w-24 text-4xl rounded-[28px]" }[size]
  return (
    <div className={cn("grid shrink-0 place-items-center bg-gradient-to-br from-[#FF7B72] to-[#C9303F] font-display font-bold text-white shadow-[0_8px_20px_-8px_hsl(0_70%_50%/0.6)]", s, className)}>
      {group}
    </div>
  )
}

const URG: Record<Urgency, string> = {
  critical: "bg-blood text-white",
  urgent: "bg-peach text-[#8a4318]",
  planned: "bg-secondary text-secondary-foreground",
}
export function UrgencyTag({ u }: { u: Urgency }) {
  return (
    <span className={cn("pill capitalize", URG[u])}>
      {u === "critical" && <motion.span className="h-1.5 w-1.5 rounded-full bg-white" animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.4 }} />}
      {u}
    </span>
  )
}

const STAT: Record<RequestStatus, string> = {
  open: "bg-blood-soft text-blood",
  fulfilled: "bg-emerald-50 text-ok",
  cancelled: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
}
export function StatusTag({ s }: { s: RequestStatus }) {
  return <span className={cn("pill capitalize", STAT[s])}>{s === "fulfilled" && <Check className="h-3 w-3" />}{s === "expired" && <Clock3 className="h-3 w-3" />}{s}</span>
}

export function VerifiedTag({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="pill bg-emerald-50 text-ok"><Check className="h-3 w-3" />Verified</span>
  ) : (
    <span className="pill bg-amber-50 text-amber-700">Needs verifying</span>
  )
}

export function EstimateNote({ className }: { className?: string }) {
  return (
    <p className={cn("text-xs leading-relaxed text-muted-foreground", className)}>
      Eligibility is an estimate from the last donation date — the donor and blood-bank staff make the final call.
    </p>
  )
}

export function SectionHead({ kicker, title, sub, children }: { kicker: string; title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mb-1 text-sm font-semibold text-blood">{kicker}</motion.p>
        <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.05 }} className="text-4xl font-medium md:text-5xl">
          {title}
        </motion.h1>
        {sub && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="mt-2 max-w-xl text-muted-foreground">{sub}</motion.p>}
      </div>
      {children}
    </div>
  )
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "soft" | "ghost" | "ok" | "dark"; size?: "md" | "lg" }
export function Btn({ variant = "primary", size = "md", className, ...p }: BtnProps) {
  const v = {
    primary: "bg-blood text-white shadow-[0_10px_24px_-10px_hsl(0_70%_50%/0.7)] hover:bg-[#c93232]",
    dark: "bg-foreground text-white hover:bg-foreground/90",
    soft: "bg-blood-soft text-blood hover:bg-[#fbdcd8]",
    ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
    ok: "bg-emerald-50 text-ok hover:bg-emerald-100",
  }[variant]
  const s = size === "lg" ? "h-12 px-6 text-[15px]" : "h-10 px-4 text-sm"
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      {...(p as object)}
      className={cn("inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40", v, s, className)}
    />
  )
}

export const fadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
} as const

export const popIn = (i: number) => ({
  initial: { opacity: 0, y: 18, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { ...SPRING, delay: i * 0.05 },
})
