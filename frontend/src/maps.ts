/// <reference types="google.maps" />
// Loads the Google Maps JavaScript API once. Rejects if there's no key, the script fails, or the key is refused.
const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
let loading: Promise<typeof google.maps> | null = null

export function loadGoogleMaps(): Promise<typeof google.maps> {
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    if (!KEY) return reject(new Error("No Google Maps key"))
    const w = window as unknown as Record<string, unknown>
    w.gm_authFailure = () => reject(new Error("Google Maps key was refused"))
    w.__rsMapsReady = () => resolve(google.maps)
    const s = document.createElement("script")
    s.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&v=weekly&callback=__rsMapsReady`
    s.async = true
    s.onerror = () => reject(new Error("Couldn't load Google Maps"))
    document.head.appendChild(s)
  })
  loading.catch(() => (loading = null)) // allow a retry later
  return loading
}

// Soft blush style matching the app theme (works without a cloud Map ID).
export const BLUSH_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#fbf1ee" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9a8487" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#fff8f6" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#f7d6cf" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#f1d2cc" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#f8ebe7" }] },
]
