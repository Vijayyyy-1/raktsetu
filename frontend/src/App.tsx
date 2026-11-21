import { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useQueryClient } from "@tanstack/react-query"
import { LogOut } from "lucide-react"
import { toast } from "sonner"
import { Toaster } from "@/components/ui/sonner"
import { Logo } from "@/components/bits"
import { BloodGuide } from "@/components/BloodGuide"
import { api, clearToken, setUnauthorizedHandler, type LiveRequest, type Role } from "@/api"
import { DEMO_ACCOUNTS, Login, loginErrorText } from "@/screens/Login"
import { Landing } from "@/screens/Landing"
import { Register } from "@/screens/Register"
import { Requests } from "@/screens/Requests"
import { Matches } from "@/screens/Matches"
import { DonorHome } from "@/screens/DonorHome"
import { AlertBell } from "@/components/AlertBell"
import { Drives } from "@/screens/Drives"
import { Donors } from "@/screens/Donors"
import { cn } from "@/lib/utils"

const initials = (s: string) => s.replace(/\(.*?\)|@.*/g, "").trim().split(/[\s._-]+/).map((w) => w[0]).join("").slice(0, 2) || "?"

const NAV: Record<Role, { id: string; label: string }[]> = {
  coordinator: [{ id: "requests", label: "Requests" }, { id: "donors", label: "Donors" }, { id: "drives", label: "Drives" }],
  donor: [{ id: "home", label: "Me" }, { id: "requests", label: "Requests" }, { id: "drives", label: "Drives" }],
}

export default function App() {
  const [session, setSession] = useState<{ role: Role; email: string; name?: string | null } | null>(null)
  const [authView, setAuthView] = useState<"landing" | "login" | "register">("landing")
  const [loginRole, setLoginRole] = useState<Role>("coordinator")
  const [page, setPage] = useState("requests")
  const [matchId, setMatchId] = useState<number | null>(null)
  const [requests, setRequests] = useState<LiveRequest[] | null>(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const qc = useQueryClient()
  // Clearing the query cache keeps the next account from seeing this one's alerts, profile or responses.
  const signOut = useCallback(() => (clearToken(), qc.clear(), setSession(null), setRequests(null), setMatchId(null)), [qc])
  // Braces matter: returning the handler would make React call it as the effect's cleanup.
  useEffect(() => {
    setUnauthorizedHandler(() => (signOut(), toast("Session expired — please sign in again")))
  }, [signOut])

  // The API lists only open requests; keep ones closed during this session so the "Closed" tab has something to show.
  // A poll that started before the user's last change would overwrite it with stale data (e.g. a just-fulfilled
  // request reappearing as open), so such results are dropped; the next poll catches up.
  const lastChange = useRef(0)
  const load = useCallback(async () => {
    const started = Date.now()
    try {
      const open = await api.listRequests()
      if (started < lastChange.current) return
      setRequests((prev) => [...open, ...(prev ?? []).filter((r) => r.status !== "open" && !open.some((o) => o.id === r.id))])
    } catch (e) {
      toast.error((e as Error).message === "Failed to fetch" ? "Can't reach the API — is it running?" : (e as Error).message)
      setRequests((prev) => prev ?? [])
    }
  }, [])

  // Confirm the token server-side and pick up the display name for the header.
  useEffect(() => {
    if (!session) return
    api.whoAmI().then((me) => setSession((s) => s && { ...s, ...me })).catch(() => {})
  }, [session?.email])

  useEffect(() => {
    if (!session) return
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [session?.email, load]) // not `session`: /auth/me enriching it must not trigger a second load

  const upsert = (r: LiveRequest) => ((lastChange.current = Date.now()), setRequests((rs) => [r, ...(rs ?? []).filter((x) => x.id !== r.id)]))
  const enter = (role: Role, email: string) => (setSession({ role, email }), setAuthView("landing"), setPage(NAV[role][0].id), setMatchId(null))
  const demo = async (role: Role) => {
    const acct = DEMO_ACCOUNTS[role]
    if (!acct.password) return setLoginRole(role), setAuthView("login")
    try {
      const s = await api.login(acct.email, acct.password)
      enter(s.role, s.email)
    } catch (e) {
      toast.error(loginErrorText(e))
    }
  }
  // Dev only: ?demo=donor&page=drives (or ?demo=coordinator&match=1) signs in with a demo account and opens a page (screenshots, rehearsals).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const q = new URLSearchParams(location.search)
    const role = q.get("demo") as Role | null
    if (role === "donor" || role === "coordinator") demo(role).then(() => (q.get("page") && setPage(q.get("page")!), q.get("match") && setMatchId(Number(q.get("match")))))
  }, [])

  const matchReq = requests?.find((r) => r.id === matchId)

  return (
    <>
      <Toaster position="bottom-right" toastOptions={{ className: "!rounded-2xl !border-0 !shadow-xl font-sans" }} />
      <AnimatePresence mode="wait">
        {!session ? (
          <motion.div key={authView} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {authView === "register" ? (
              <Register onDone={enter} onBack={() => setAuthView("login")} />
            ) : authView === "login" ? (
              <Login key={loginRole} initialRole={loginRole} onLogin={enter} onRegister={() => setAuthView("register")} onBack={() => setAuthView("landing")} />
            ) : (
              <Landing onSignIn={() => setAuthView("login")} onRegister={() => setAuthView("register")} onDemo={demo} />
            )}
          </motion.div>
        ) : (
          <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen">
            <header className="sticky top-0 z-40 px-4 pt-4 sm:px-6">
              <div className="mx-auto flex h-16 max-w-7xl items-center gap-1.5 rounded-full border border-blood/10 bg-white/95 pl-4 pr-2 sm:gap-4 sm:pl-6 shadow-[0_1px_2px_hsl(350_40%_30%/0.06),0_12px_32px_-14px_hsl(0_60%_40%/0.35)] backdrop-blur-xl">
                <Logo className="shrink-0 [&>span]:hidden sm:[&>span]:inline" />
                <nav className="ml-auto flex min-w-0 gap-1 rounded-full bg-secondary p-1 sm:ml-6 sm:mr-auto">
                  {NAV[session.role].map((n) => (
                    <button
                      key={n.id}
                      onClick={() => (setPage(n.id), setMatchId(null))}
                      className={cn("relative rounded-full px-2.5 py-2 text-sm font-semibold transition-colors sm:px-4", page === n.id ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
                    >
                      {page === n.id && <motion.span layoutId="nav" className="absolute inset-0 rounded-full bg-white shadow-sm" transition={{ type: "spring", stiffness: 260, damping: 26 }} />}
                      <span className="relative whitespace-nowrap">{n.label}</span>
                    </button>
                  ))}
                </nav>
                {session.role === "donor" && <AlertBell onOpenRequests={() => (setPage("requests"), setMatchId(null))} />}
                <span className="hidden sm:contents"><BloodGuide /></span>
                <button onClick={signOut} className="flex items-center gap-2 rounded-full p-1.5 text-sm font-semibold transition-colors hover:bg-muted sm:pr-4" aria-label="Sign out">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-blood-soft text-xs font-bold uppercase text-blood">{initials(session.name ?? session.email)}</span>
                  <span className="hidden text-left leading-tight sm:block">
                    <span className="block">{session.name?.replace(/\s*\(.*?\)/g, "") ?? session.email}</span>
                    <span className="block text-[11px] font-medium capitalize text-muted-foreground">{session.role}</span>
                  </span>
                  <LogOut className="hidden h-4 w-4 text-muted-foreground sm:block" />
                </button>
              </div>
            </header>

            <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
              <AnimatePresence mode="wait">
                {matchReq ? (
                  <Matches key={`m-${matchReq.id}`} req={matchReq} now={now} onBack={() => setMatchId(null)} onChange={upsert} />
                ) : page === "requests" ? (
                  <Requests key={`r-${session.role}`} requests={requests} now={now} onChange={upsert} onRefresh={load} onMatch={setMatchId} readOnly={session.role === "donor"} />
                ) : page === "donors" ? (
                  <Donors key="donors" />
                ) : page === "drives" ? (
                  <Drives key={`d-${session.role}`} role={session.role} />
                ) : (
                  <DonorHome key="home" requests={requests} now={now} />
                )}
              </AnimatePresence>
            </main>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
