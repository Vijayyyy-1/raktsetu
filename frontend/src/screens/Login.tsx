import { useState, type FormEvent, type InputHTMLAttributes } from "react"
import { motion } from "framer-motion"
import { ArrowLeft, ArrowRight, Loader2, Lock } from "lucide-react"
import { toast } from "sonner"
import { Btn, Drop, Logo, SPRING } from "@/components/bits"
import { api, type Role } from "@/api"
import { cn } from "@/lib/utils"

// Demo accounts from the API seed (prisma/seed.ts). The coordinator password comes from a local, git-ignored env var.
export const DEMO_ACCOUNTS: Record<Role, { email: string; password: string }> = {
  donor: { email: "anaya@example.test", password: "DonorDemo123!" },
  coordinator: { email: "coordinator@example.test", password: import.meta.env.VITE_DEMO_COORDINATOR_PASSWORD ?? "" },
}

const ROLES = [
  { id: "donor" as Role, label: "Donor", sub: "Hear only about requests you can actually answer." },
  { id: "coordinator" as Role, label: "Coordinator", sub: "Post, verify and match urgent requests." },
]

export const loginErrorText = (err: unknown) => ((err as Error).message === "Failed to fetch" ? "Can't reach the API — is it running?" : (err as Error).message)

export function Login({ onLogin, onRegister, onBack, initialRole = "coordinator" }: { onLogin: (r: Role, email: string) => void; onRegister: () => void; onBack: () => void; initialRole?: Role }) {
  const [role, setRole] = useState<Role>(initialRole)
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
      toast.error(loginErrorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-6">
      <div className="flex items-center justify-between">
        <Logo />
        <button onClick={onBack} className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-4 py-2 text-sm font-medium shadow-sm hover:bg-white">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      </div>

      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="soft-card relative my-auto overflow-hidden p-8 sm:p-10">
        <Drop className="absolute right-8 top-8 h-20 w-16" />
        <h1 className="relative text-4xl font-medium">Welcome back</h1>
        <p className="relative mt-1 text-sm text-muted-foreground">Pick a demo account or use your own.</p>

        <div className="relative mt-8 grid grid-cols-2 rounded-full bg-muted p-1">
          {ROLES.map((r) => (
            <button key={r.id} onClick={() => setRole(r.id)} className={cn("relative rounded-full py-2.5 text-sm font-semibold transition-colors", role === r.id ? "text-foreground" : "text-muted-foreground")}>
              {role === r.id && <motion.span layoutId="role" transition={SPRING} className="absolute inset-0 rounded-full bg-white shadow-sm" />}
              <span className="relative">{r.label}</span>
            </button>
          ))}
        </div>
        <motion.p key={`sub-${role}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 text-center text-sm text-muted-foreground">{current.sub}</motion.p>

        <form key={role} className="mt-8 space-y-4" onSubmit={submit}>
          <Field label="Email" id="email" name="email" type="email" required autoComplete="username" defaultValue={DEMO_ACCOUNTS[role].email} />
          <Field label="Password" id="pw" name="password" type="password" required autoComplete="current-password" defaultValue={DEMO_ACCOUNTS[role].password} />
          <Btn type="submit" size="lg" className="group w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Sign in <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></>}
          </Btn>
        </form>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          New donor? <button onClick={onRegister} className="font-semibold text-blood hover:underline">Create an account</button>
        </p>
        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" /> Phone numbers are never shared without the donor saying yes.
        </p>
      </motion.div>
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
