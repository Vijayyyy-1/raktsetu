import { useState } from "react"
import { CalendarDays } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

// Past-only date picker in the app's pill style. Clicking the selected day again clears it.
export function DatePicker({ value, onChange, placeholder = "Pick a date", label, className }: {
  value: Date | undefined
  onChange: (d: Date | undefined) => void
  placeholder?: string
  label: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={label} className={cn("flex h-11 min-w-0 items-center gap-2 rounded-full border border-input bg-white px-4 text-sm outline-none transition-colors hover:border-blood/40 focus-visible:border-blood/50 focus-visible:ring-4 focus-visible:ring-blood/10", className)}>
          <CalendarDays className="h-4 w-4 shrink-0 text-blood" />
          <span className={cn("truncate", !value && "text-muted-foreground")}>{value ? value.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : placeholder}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto rounded-2xl p-0">
        <Calendar mode="single" selected={value} defaultMonth={value} captionLayout="dropdown" startMonth={new Date(2000, 0)} endMonth={new Date()} disabled={{ after: new Date() }} onSelect={(d) => (onChange(d), setOpen(false))} />
      </PopoverContent>
    </Popover>
  )
}
