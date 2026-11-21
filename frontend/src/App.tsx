import { useCallback, useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { LogOut } from "lucide-react"
import { toast } from "sonner"
import { Toaster } from "@/components/ui/sonner"
import { Logo } from "@/components/bits"
import { api, clearToken, setUnauthorizedHandler, type LiveRequest, type Role } from "@/api"
import { Login } from "@/screens/Login"
import { Register } from "@/screens/Register"
import { Requests } from "@/screens/Requests"
import { Matches } from "@/screens/Matches"
import { DonorHome } from "@/screens/DonorHome"
import { cn } from "@/lib/utils"

const initials = (s: string) => s.replace(/\(.*?\)|@.*/g, "").trim().split(/[\s._-]+/).map((w) => w[0]).join("").slice(0, 2) || "?"

const NAV: Record<Role, { id: string; label: string }[]> = {
  coordinator: [{ id: "requests", label: "Requests" }],
  donor: [{ id: "home", label: "Me" }, { id: "requests", label: "Requests" }],
}

export default function App() {
  const [session, setSession] = useState<{ role: Role; email: string; name?: string | null } | null>(null)
  const [registering, setRegistering] = useState(false)
  const [page, setPage] = useState("requests")
  const [matchId, setMatchId] = useState<number | null>(null)
  const [requests, setRequests] = useState<LiveRequest[] | null>(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const signOut = useCallback(() => (clearToken(), setSession(null), setRequests(null), setMatchId(null)), [])
  useEffect(() => setUnauthorizedHandler(() => (signOut(), toast("Session expired — please sign in again"))), [signOut])

  // The API lists only open requests; keep ones closed during this session so the "Closed" tab has something to show.
  const load = useCallback(async () => {
    try {
      const open = await api.listRequests()
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
  }, [session, load])

  const upsert = (r: LiveRequest) => setRequests((rs) => [r, ...(rs ?? []).filter((x) => x.id !== r.id)])
  const enter = (role: Role, email: string) => (setSession({ role, email }), setRegistering(false), setPage(NAV[role][0].id), setMatchId(null))
  const matchReq = requests?.find((r) => r.id === matchId)

  return (
    <>
      <Toaster position="bottom-right" toastOptions={{ className: "!rounded-2xl !border-0 !shadow-xl font-sans" }} />
      <AnimatePresence mode="wait">
        {!session ? (
          <motion.div key={registering ? "register" : "login"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {registering ? <Register onDone={enter} onBack={() => setRegistering(false)} /> : <Login onLogin={enter} onRegister={() => setRegistering(true)} />}
          </motion.div>
        ) : (
          <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen">
            <header className="sticky top-0 z-40 px-4 pt-4 sm:px-6">
              <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 rounded-full border border-white/70 bg-white/70 pl-6 pr-2 shadow-[0_10px_30px_-18px_hsl(0_60%_40%/0.35)] backdrop-blur-xl">
                <Logo />
                <nav className="ml-auto flex gap-1 rounded-full bg-muted/70 p-1 sm:ml-6 sm:mr-auto">
                  {NAV[session.role].map((n) => (
                    <button
                      key={n.id}
                      onClick={() => (setPage(n.id), setMatchId(null))}
                      className={cn("relative rounded-full px-4 py-2 text-sm font-semibold transition-colors", page === n.id ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
                    >
                      {page === n.id && <motion.span layoutId="nav" className="absolute inset-0 rounded-full bg-white shadow-sm" transition={{ type: "spring", stiffness: 260, damping: 26 }} />}
                      <span className="relative whitespace-nowrap">{n.label}</span>
                    </button>
                  ))}
                </nav>
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
