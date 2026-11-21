import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { ArrowRight, BellRing, Loader2, ShieldCheck, TimerReset } from "lucide-react"
import { Btn, Drop, Logo, SPRING, popIn } from "@/components/bits"
import { BloodGuide } from "@/components/BloodGuide"
import { LiveMap, type MapRequest } from "@/components/LiveMap"
import { api, type Role } from "@/api"
import { HOSPITALS } from "@/data"

// Shown when there are no live requests (or the API is down) so the map never sits empty.
const DEMO: MapRequest[] = [
  { group: "B+", units: 2, hospital: HOSPITALS[1].name, lat: HOSPITALS[1].lat, lng: HOSPITALS[1].lng },
  { group: "O-", units: 1, hospital: HOSPITALS[0].name, lat: HOSPITALS[0].lat, lng: HOSPITALS[0].lng },
  { group: "A+", units: 2, hospital: HOSPITALS[4].name, lat: HOSPITALS[4].lat, lng: HOSPITALS[4].lng },
]

const STEPS = [
  { icon: ShieldCheck, title: "Post & verify", text: "A coordinator posts the need and confirms it with the hospital. No fake “urgent” messages." },
  { icon: BellRing, title: "Match in seconds", text: "Only nearby donors with a compatible group who can give today are alerted. Everyone else is left in peace." },
  { icon: TimerReset, title: "Closes itself", text: "Every request expires, and closes the moment the need is met. Nothing gets forwarded for days." },
]

const STATS = [
  { n: "1.46 crore", l: "units of blood collected in India in 2024–25 — roughly what the country needs" },
  { n: "~30%", l: "still comes from family and friends asked to give after a patient needs blood" },
  { n: "up to 50%", l: "fewer donations in summer and festival months" },
]

export function Landing({ onSignIn, onRegister, onDemo }: { onSignIn: () => void; onRegister: () => void; onDemo: (r: Role) => Promise<void> }) {
  const [live, setLive] = useState<MapRequest[] | null>(null)
  const [demoing, setDemoing] = useState<Role | null>(null)

  useEffect(() => {
    api.listRequests()
      .then((rs) => setLive(rs.filter((r) => r.verified).map((r) => ({ group: r.group, units: r.units, hospital: r.hospital, lat: r.lat, lng: r.lng }))))
      .catch(() => setLive([]))
  }, [])

  const demo = (r: Role) => (setDemoing(r), onDemo(r).finally(() => setDemoing(null)))
  const count = live?.length ?? 0

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <div className="flex items-center gap-1 sm:gap-2">
          <BloodGuide label="Blood groups" className="hidden px-3 sm:inline-flex" />
          <Btn variant="ghost" onClick={onSignIn}>Sign in</Btn>
          <Btn onClick={onRegister} className="hidden sm:inline-flex">Become a donor</Btn>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] items-center gap-10 px-4 pb-16 pt-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:gap-14">
        <div>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="pill mb-6 bg-white/85 text-foreground shadow-sm">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blood opacity-60" /><span className="relative h-2 w-2 rounded-full bg-blood" /></span>
            {live === null ? "Checking live requests…" : count > 0 ? `${count} verified ${count === 1 ? "request" : "requests"} open in Pune right now` : "No open requests right now — showing a demo"}
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="text-[44px] font-normal leading-[1.02] sm:text-6xl xl:text-7xl">
            Every drop,
            <br />
            <span className="italic text-blood">to the right place.</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="mt-6 max-w-lg text-lg text-muted-foreground">
            “B+ve needed urgently, please share” gets forwarded for days after the need has passed. RaktSetu reaches only the nearby donors who can actually give — and stops the moment it's solved.
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.25 }} className="mt-8 flex flex-wrap gap-3">
            <Btn size="lg" onClick={() => demo("coordinator")} disabled={!!demoing}>
              {demoing === "coordinator" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Try as coordinator <ArrowRight className="h-4 w-4" />
            </Btn>
            <Btn size="lg" variant="soft" onClick={() => demo("donor")} disabled={!!demoing}>
              {demoing === "donor" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Try as donor
            </Btn>
          </motion.div>
          <p className="mt-4 text-sm text-muted-foreground">
            Want to help? <button onClick={onRegister} className="font-semibold text-blood hover:underline">Join the donor registry</button> in two minutes.
          </p>
        </div>

        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...SPRING, delay: 0.1 }}>
          <LiveMap requests={live && live.length > 0 ? live : DEMO} className="h-[420px] sm:h-[540px]" />
        </motion.div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <p className="mb-2 text-sm font-semibold text-blood">How it works</p>
        <h2 className="mb-8 text-4xl font-medium">From plea to donor, <span className="italic text-blood">without the noise</span></h2>
        <div className="grid gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <motion.div key={s.title} {...popIn(i)} className="soft-card p-6">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blood-soft text-blood"><s.icon className="h-5 w-5" /></span>
                <span className="font-display text-sm text-muted-foreground">0{i + 1}</span>
              </div>
              <h3 className="mt-4 text-2xl font-medium">{s.title}</h3>
              <p className="mt-2 text-muted-foreground">{s.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <div className="relative overflow-hidden rounded-[32px] bg-foreground p-8 text-white sm:p-12">
          <Drop className="absolute -right-6 -top-6 h-40 w-32 opacity-80" />
          <h2 className="relative max-w-xl text-3xl font-medium sm:text-4xl">The gap isn't supply. It's getting the right donor to the right place in time.</h2>
          <div className="relative mt-10 grid gap-8 sm:grid-cols-3">
            {STATS.map((s) => (
              <div key={s.n}>
                <div className="font-display text-4xl font-medium text-[#ff8a80] sm:text-5xl">{s.n}</div>
                <p className="mt-2 text-sm text-white/70">{s.l}</p>
              </div>
            ))}
          </div>
          <p className="relative mt-8 text-xs text-white/40">Source: Naya Bharat 2047 problem statement 2.2 (ORF; ISBT Transfusion Today, 2025)</p>
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 pb-10 text-xs text-muted-foreground sm:px-6">
        <span>Problem 2.2 · Healthy Bharat · Naya Bharat 2047 · Rotary × Rotaract</span>
        <span>Eligibility shown in the app is an estimate — final clearance by blood-bank staff.</span>
      </footer>
    </div>
  )
}
