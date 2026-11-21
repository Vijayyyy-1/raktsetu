import { useEffect, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, Check, Loader2, LocateFixed, MapPin, Search } from "lucide-react"
import { toast } from "sonner"
import { Btn, Drop, Logo, SPRING } from "@/components/bits"
import { api, type Role } from "@/api"
import { GROUPS, type Group } from "@/data"
import { approx, placeLocation, placesEnabled, searchPlaces, type Suggestion } from "@/places"
import { cn } from "@/lib/utils"

type Loc = { area: string; lat: number; lng: number }

export function Register({ onDone, onBack }: { onDone: (r: Role, email: string) => void; onBack: () => void }) {
  const [group, setGroup] = useState<Group | null>(null)
  const [loc, setLoc] = useState<Loc | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!group) return toast.error("Pick your blood group")
    if (!loc) return toast.error("Add your area so we can find requests near you")
    const f = new FormData(e.currentTarget)
    const last = String(f.get("lastDonation") || "")
    setBusy(true)
    try {
      const s = await api.register({
        email: String(f.get("email")), password: String(f.get("password")), displayName: String(f.get("name")), phone: String(f.get("phone")),
        group, area: loc.area, lat: loc.lat, lng: loc.lng, lastDonationAt: last ? new Date(last).toISOString() : undefined,
      })
      toast.success("Welcome to RaktSetu", { description: "You're on the registry. We'll only reach out when you can really help." })
      onDone(s.role, s.email)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between">
        <Logo />
        <button onClick={onBack} className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-4 py-2 text-sm font-medium shadow-sm hover:bg-white">
          <ArrowLeft className="h-4 w-4" /> Sign in instead
        </button>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="soft-card relative mt-10 overflow-hidden p-6 sm:p-10">
        <Drop className="absolute right-8 top-8 hidden h-20 w-16 sm:block" />
        <p className="text-sm font-semibold text-blood">Join the registry</p>
        <h1 className="mt-1 text-4xl font-medium sm:text-5xl">Become a <span className="italic text-blood">donor</span></h1>
        <p className="mt-2 max-w-md text-muted-foreground">Two minutes now could mean someone nearby gets blood in time.</p>

        <form onSubmit={submit} className="mt-10 space-y-8">
          <Section n={1} title="About you">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" name="name" required minLength={2} autoComplete="name" placeholder="Aarav Kulkarni" />
              <Field label="Phone" name="phone" required type="tel" pattern="\+?[0-9 ()\-]{7,20}" autoComplete="tel" placeholder="+91 98765 43210" hint="Encrypted. Only shared with a coordinator for a request you match." />
              <Field label="Email" name="email" required type="email" autoComplete="email" placeholder="you@college.edu" />
              <Field label="Password" name="password" required type="password" minLength={10} autoComplete="new-password" placeholder="At least 10 characters" />
            </div>
          </Section>

          <Section n={2} title="Your blood group">
            <div className="grid grid-cols-4 gap-2">
              {GROUPS.map((g) => (
                <button type="button" key={g} onClick={() => setGroup(g)} className={cn("relative h-14 rounded-2xl font-display text-xl font-semibold transition-colors", group === g ? "text-white" : "bg-muted hover:bg-secondary")}>
                  {group === g && <motion.span layoutId="reg-grp" transition={SPRING} className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#FF7B72] to-[#C9303F]" />}
                  <span className="relative">{g}</span>
                </button>
              ))}
            </div>
          </Section>

          <Section n={3} title="Where you usually are">
            <LocationPicker value={loc} onChange={setLoc} />
          </Section>

          <Section n={4} title="Last donation" optional>
            <Field label="Date of your last donation" name="lastDonation" type="date" max={new Date().toISOString().slice(0, 10)} hint="Leave empty if you've never donated." />
          </Section>

          <Btn type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Join the registry"}
          </Btn>
        </form>
      </motion.div>
    </div>
  )
}

function LocationPicker({ value, onChange }: { value: Loc | null; onChange: (l: Loc | null) => void }) {
  const [q, setQ] = useState("")
  const [results, setResults] = useState<Suggestion[]>([])
  const [locating, setLocating] = useState(false)

  useEffect(() => {
    if (value || q.trim().length < 3) return setResults([])
    const t = setTimeout(() => searchPlaces(q).then(setResults).catch((e) => toast.error(e.message)), 300)
    return () => clearTimeout(t)
  }, [q, value])

  const pick = async (s: Suggestion) => {
    try {
      const { lat, lng } = await placeLocation(s.id)
      onChange({ area: s.main, lat: approx(lat), lng: approx(lng) })
      setResults([])
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const useGps = () => {
    if (!navigator.geolocation) return toast.error("Location isn't available in this browser")
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false)
        // Area name is what the donor typed, or a neutral label; coordinates are rounded to ~1 km.
        onChange({ area: q.trim() || "Near my location", lat: approx(p.coords.latitude), lng: approx(p.coords.longitude) })
      },
      () => (setLocating(false), toast.error("Couldn't get your location — try searching instead")),
      { timeout: 10000 },
    )
  }

  if (value)
    return (
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-ok text-white"><Check className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{value.area}</div>
          <div className="text-xs text-muted-foreground">Saved to about 1 km — we never store your exact address.</div>
        </div>
        <button type="button" onClick={() => onChange(null)} className="text-sm font-semibold text-ok hover:underline">Change</button>
      </motion.div>
    )

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placesEnabled ? "Search your area, hostel or college" : "Type your area, then use your location"}
          className="h-12 w-full rounded-full border border-input bg-white pl-11 pr-4 text-sm outline-none focus:border-blood/50 focus:ring-4 focus:ring-blood/10"
          aria-label="Search for your area"
        />
        <AnimatePresence>
          {results.length > 0 && (
            <motion.ul initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute inset-x-0 top-14 z-10 overflow-hidden rounded-2xl bg-white p-1.5 shadow-xl">
              {results.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => pick(s)} className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-muted">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blood" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{s.main}</span>
                      <span className="block truncate text-xs text-muted-foreground">{s.secondary}</span>
                    </span>
                  </button>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
      <Btn type="button" variant="soft" onClick={useGps} disabled={locating}>
        {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />} Use my current location
      </Btn>
    </div>
  )
}

function Section({ n, title, optional, children }: { n: number; title: string; optional?: boolean; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-blood-soft text-xs font-bold text-blood">{n}</span>
        <h2 className="text-xl font-medium">{title}</h2>
        {optional && <span className="text-xs text-muted-foreground">optional</span>}
      </div>
      {children}
    </section>
  )
}

function Field({ label, hint, ...rest }: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="ml-4 text-xs font-semibold text-muted-foreground">{label}</span>
      <input {...rest} className="mt-1 h-12 w-full rounded-full border border-input bg-white px-5 text-sm outline-none transition-shadow focus:border-blood/50 focus:ring-4 focus:ring-blood/10" />
      {hint && <span className="ml-4 mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  )
}
