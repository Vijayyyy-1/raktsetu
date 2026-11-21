import { useState, type FormEvent, type InputHTMLAttributes } from "react"
import { motion } from "framer-motion"
import { ArrowRight, BellRing, Loader2, Lock } from "lucide-react"
import { toast } from "sonner"
import { Btn, Drop, Logo, SPRING } from "@/components/bits"
import { api, type Role } from "@/api"
import { cn } from "@/lib/utils"

// Demo accounts from the API seed (prisma/seed.ts). Coordinator password is set in the API's .env, so it isn't prefilled.
const ROLES = [
  { id: "donor" as Role, label: "Donor", email: "anaya@example.test", password: "DonorDemo123!", sub: "Hear only about requests you can actually answer." },
  { id: "coordinator" as Role, label: "Coordinator", email: "coordinator@example.test", password: "", sub: "Post, verify and match urgent requests." },
]

// What the problem looks like today.
const FORWARDS = [
  { t: "Fwd: Fwd: URGENT B+ve needed at City Hospital pls share 🙏", ago: "6 days ago" },
  { t: "Forwarded many times — O-ve required in ICU, call 98•••", ago: "3 days ago" },
  { t: "A+ needed TODAY at Sassoon, forward to all groups!!", ago: "11 days ago" },
]

const STATS = [
  { n: "1.46 Cr", l: "units collected in India last year" },
  { n: "30%", l: "still come from last-minute replacement donors" },
  { n: "−50%", l: "donations in summer & festival months" },
]

export function Login({ onLogin, onRegister }: { onLogin: (r: Role, email: string) => void; onRegister: () => void }) {
  const [role, setRole] = useState<Role>("coordinator")
  const [busy, setBusy] = useState(false)
  const current = ROLES.find((r) => r.id === role)!

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    try {
      const s = await api.login(String(f.get("email")), String(f.get("password")))
      onLogin(s.role, s.email)
    } catch (err) {
      toast.error((err as Error).message === "Failed to fetch" ? "Can't reach the API — is it running?" : (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6">
      <Logo />

      <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
        {/* Story */}
        <div>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pill mb-6 bg-white/80 text-blood shadow-sm">
            Problem 2.2 · Healthy Bharat
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="text-[44px] font-normal leading-[1.02] sm:text-6xl lg:text-7xl">
            Every drop,
            <br />
            <span className="italic text-blood">to the right place.</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mt-6 max-w-lg text-lg text-muted-foreground">
            Urgent requests get forwarded for days after the need has passed. RaktSetu quietly reaches only nearby, compatible donors who can give today — and stops the moment it's solved.
          </motion.p>

          {/* Before → after */}
          <div className="relative mt-10 max-w-lg">
            <div className="space-y-2">
              {FORWARDS.map((f, i) => (
                <motion.div
                  key={f.t}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: [0, 1, 1, 0.35], x: 0 }}
                  transition={{ delay: 0.4 + i * 0.25, duration: 2.4, times: [0, 0.15, 0.7, 1] }}
                  className="w-fit max-w-[90%] rounded-2xl rounded-tl-md bg-white/80 px-4 py-2.5 text-sm shadow-sm"
                  style={{ marginLeft: i * 18 }}
                >
                  {f.t}
                  <span className="ml-2 text-[11px] text-muted-foreground line-through">{f.ago}</span>
                </motion.div>
              ))}
            </div>
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ ...SPRING, delay: 2.2 }}
              className="soft-card relative -mt-6 ml-auto flex w-[85%] items-center gap-3 p-4"
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-blood-soft text-blood"><BellRing className="h-5 w-5" /></div>
              <div className="text-sm">
                <div className="font-semibold">B+ at Ruby Hall · 3.2 km · verified</div>
                <div className="text-muted-foreground">Sent to 6 matched donors in 2 seconds. 58 others left in peace.</div>
              </div>
            </motion.div>
          </div>

          <div className="mt-12 grid max-w-lg grid-cols-3 gap-4">
            {STATS.map((s, i) => (
              <motion.div key={s.l} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 + i * 0.08 }}>
                <div className="font-display text-3xl font-medium">{s.n}</div>
                <div className="mt-1 text-xs leading-snug text-muted-foreground">{s.l}</div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Sign in */}
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.15 }} className="soft-card relative overflow-hidden p-8 sm:p-10">
          <Drop className="absolute right-8 top-8 h-20 w-16" />
          <h2 className="relative text-4xl font-medium">Welcome back</h2>
          <p className="relative mt-1 text-sm text-muted-foreground">Pick a demo account or use your own.</p>

          <div className="relative mt-8 grid grid-cols-2 rounded-full bg-muted p-1">
            {ROLES.map((r) => (
              <button key={r.id} onClick={() => setRole(r.id)} className={cn("relative rounded-full py-2.5 text-sm font-semibold transition-colors", role === r.id ? "text-foreground" : "text-muted-foreground")}>
                {role === r.id && <motion.span layoutId="role" transition={SPRING} className="absolute inset-0 rounded-full bg-white shadow-sm" />}
                <span className="relative">{r.label}</span>
              </button>
            ))}
          </div>
          <motion.p key={`sub-${role}`}initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 text-center text-sm text-muted-foreground">{current.sub}</motion.p>

          <form key={role} className="mt-8 space-y-4" onSubmit={submit}>
            <Field label="Email" id="email" name="email" type="email" required autoComplete="username" defaultValue={current.email} />
            <Field label="Password" id="pw" name="password" type="password" required autoComplete="current-password" defaultValue={current.password} />
            <Btn type="submit" size="lg" className="group w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Sign in <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></>}
            </Btn>
          </form>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            New donor?{" "}
            <button onClick={onRegister} className="font-semibold text-blood hover:underline">Create an account</button>
          </p>
          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> Phone numbers are never shared without the donor saying yes.
          </p>
        </motion.div>
      </div>
    </div>
  )
}

function Field({ label, id, ...rest }: { label: string; id: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label htmlFor={id} className="block">
      <span className="ml-4 text-xs font-semibold text-muted-foreground">{label}</span>
      <input id={id} {...rest} className="mt-1 h-12 w-full rounded-full border border-input bg-white px-5 text-sm outline-none transition-shadow focus:border-blood/50 focus:ring-4 focus:ring-blood/10" />
    </label>
  )
}
