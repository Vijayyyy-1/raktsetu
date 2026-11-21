// Google Places (New) REST calls — address search for donor sign-up. Needs VITE_GOOGLE_MAPS_API_KEY with Places API (New) enabled.
const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
export const placesEnabled = Boolean(KEY)

export type Suggestion = { id: string; main: string; secondary: string }

export async function searchPlaces(input: string): Promise<Suggestion[]> {
  if (!KEY || input.trim().length < 3) return []
  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat" },
    // Bias results to Pune; still allows anywhere in India.
    body: JSON.stringify({ input, includedRegionCodes: ["in"], locationBias: { circle: { center: { latitude: 18.52, longitude: 73.86 }, radius: 50000 } } }),
  })
  if (!res.ok) throw new Error("Address search is unavailable")
  const data = await res.json()
  return (data.suggestions ?? []).map((s: { placePrediction: { placeId: string; structuredFormat: { mainText: { text: string }; secondaryText?: { text: string } } } }) => ({
    id: s.placePrediction.placeId,
    main: s.placePrediction.structuredFormat.mainText.text,
    secondary: s.placePrediction.structuredFormat.secondaryText?.text ?? "",
  }))
}

export async function placeLocation(id: string): Promise<{ lat: number; lng: number }> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${id}`, { headers: { "X-Goog-Api-Key": KEY!, "X-Goog-FieldMask": "location" } })
  if (!res.ok) throw new Error("Couldn't read that place's location")
  const { location } = await res.json()
  return { lat: location.latitude, lng: location.longitude }
}

// ~1 km precision: enough for matching, avoids storing a donor's exact home.
export const approx = (n: number) => Math.round(n * 100) / 100
