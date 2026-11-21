export const GROUPS = ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"] as const
export type Group = (typeof GROUPS)[number]

// Which donor groups a recipient can receive red cells from (mirrors src/common/matching.ts in the API).
export const CAN_RECEIVE: Record<Group, Group[]> = {
  "O-": ["O-"],
  "O+": ["O-", "O+"],
  "A-": ["O-", "A-"],
  "A+": ["O-", "O+", "A-", "A+"],
  "B-": ["O-", "B-"],
  "B+": ["O-", "O+", "B-", "B+"],
  "AB-": ["O-", "A-", "B-", "AB-"],
  "AB+": [...GROUPS],
}

export type Urgency = "critical" | "urgent" | "planned"
export type RequestStatus = "open" | "fulfilled" | "cancelled" | "expired"

// shortcut: fixed hospital list with approximate coordinates; swap for Google Places search when needed.
export const HOSPITALS = [
  { name: "Sassoon General Hospital", area: "Station Road", lat: 18.5286, lng: 73.8743 },
  { name: "Ruby Hall Clinic", area: "Sangamwadi", lat: 18.5326, lng: 73.8771 },
  { name: "Jehangir Hospital", area: "Camp", lat: 18.5308, lng: 73.8766 },
  { name: "KEM Hospital", area: "Rasta Peth", lat: 18.5196, lng: 73.8653 },
  { name: "Deenanath Mangeshkar Hospital", area: "Erandwane", lat: 18.5028, lng: 73.8283 },
  { name: "Sahyadri Hospital", area: "Deccan", lat: 18.5155, lng: 73.8418 },
]

export const maskPhone = (p: string) => `${p.slice(0, 3)}••• ••${p.slice(-3)}`

// Monthly donations index (100 = need met) — illustrative, shows the summer/festival dip.
export const MONTHLY_SUPPLY = [
  { m: "Jan", v: 104 }, { m: "Feb", v: 101 }, { m: "Mar", v: 88 }, { m: "Apr", v: 66 }, { m: "May", v: 52 }, { m: "Jun", v: 61 },
  { m: "Jul", v: 83 }, { m: "Aug", v: 90 }, { m: "Sep", v: 78 }, { m: "Oct", v: 58 }, { m: "Nov", v: 71 }, { m: "Dec", v: 96 },
]
