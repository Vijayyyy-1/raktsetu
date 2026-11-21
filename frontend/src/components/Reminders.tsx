import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { BellPlus, CalendarDays, MapPin, Sun } from "lucide-react"
import { Btn } from "@/components/bits"
import { api, distanceKm, type DonorProfile, type Drive, type Eligibility } from "@/api"
import { cn } from "@/lib/utils"

// Donations fall by up to 50% in summer and festival months (problem statement 2.2).
const LEAN: Record<number, string> = { 3: "summer", 4: "summer", 5: "summer", 9: "festival season", 10: "festival season" }

/** A calendar invite is the reminder that works with no push setup: it lives on the donor's own phone. */
function downloadReminder(at: Date) {
  const d = (x: Date) => x.toISOString().slice(0, 10).replace(/-/g, "")
  const end = new Date(at.getTime() + 86400000)
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//RaktSetu//Reminder//EN", "BEGIN:VEVENT",
    `UID:raktsetu-${at.getTime()}@raktsetu`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${d(at)}`, `DTEND;VALUE=DATE:${d(end)}`,
    "SUMMARY:You can donate blood again 🩸", `DESCRIPTION:Your 56-day gap is up. Open RaktSetu to see requests and drives near you: ${location.origin}`,
    "BEGIN:VALARM", "TRIGGER:PT9H", "ACTION:DISPLAY", "DESCRIPTION:You can donate blood again", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n")
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([ics], { type: "text/calendar" })), download: "raktsetu-reminder.ics" })
  a.click()
  URL.revokeObjectURL(a.href)
}

/** Donor nudges: eligible-again, a calendar reminder while resting, and a lean-month push towards the next drive. */
export function Reminders({ me, elig, now }: { me: DonorProfile; elig: Eligibility; now: number }) {
  const [drive, setDrive] = useState<Drive | null>(null)
  useEffect(() => {
    api.drives({ lat: me.lat, lng: me.lng }).then((ds) => setDrive(ds.filter((d) => d.endsAt > Date.now()).sort((a, b) => a.startsAt - b.startsAt)[0] ?? null)).catch(() => {})
  }, [me.lat, me.lng])

  const lean = LEAN[new Date(now).getMonth()]
  const next = elig.nextEligibleAt ? new Date(elig.nextEligibleAt) : null
  const daysSince = me.lastDonationAt ? Math.floor((now - Date.parse(me.lastDonationAt)) / 86400000) : null
  if (!lean && !elig.eligible && !next) return null

  const title = elig.eligible
    ? daysSince === null ? "Ready for your first donation?" : `It's been ${daysSince} days — you can donate again`
    : `You can donate again on ${next!.toLocaleDateString("en-IN", { day: "numeric", month: "long" })}`
  const body = lean
    ? `It's ${lean}: blood donations drop by up to 50% now, right when hospitals still need them.`
    : elig.eligible ? "Regular donors keep the bank steady through the lean months." : "We'll stay quiet until then. Add a reminder so you don't miss the day."

  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className={cn("flex flex-wrap items-center gap-4 rounded-[24px] p-5", lean ? "bg-peach text-[#7a3a14]" : "bg-white shadow-[0_10px_30px_-16px_hsl(0_60%_40%/0.25)]")}>
      <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", lean ? "bg-white/60" : "bg-blood-soft text-blood")}>
        {lean ? <Sun className="h-5 w-5" /> : <CalendarDays className="h-5 w-5" />}
      </div>
      <div className="min-w-[14rem] flex-1">
        <div className="font-semibold">{title}</div>
        <div className="text-sm opacity-80">{body}</div>
        {elig.eligible && drive && (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium">
            <MapPin className="h-3.5 w-3.5" />Next drive: {drive.title.replace(/\s*\(Demo\)/, "")} · {new Date(drive.startsAt).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} · {Math.round(distanceKm(me.lat, me.lng, drive.lat, drive.lng) * 10) / 10} km · see Drives
          </div>
        )}
      </div>
      {!elig.eligible && next && (
        <Btn variant={lean ? "dark" : "soft"} onClick={() => downloadReminder(next)}><BellPlus className="h-4 w-4" /> Remind me</Btn>
      )}
    </motion.div>
  )
}
