import type { WeatherLocation } from './weatherTypes'

const endpoint = 'https://msearch.gsi.go.jp/address-search/AddressSearch'

type GsiFeature = {
  geometry?: { coordinates?: unknown }
}

export class LocationNotFoundError extends Error {
  constructor() {
    super('Location not found')
    this.name = 'LocationNotFoundError'
  }
}

function coordinatesOf(feature: GsiFeature): [number, number] | undefined {
  const coordinates = feature.geometry?.coordinates
  if (!Array.isArray(coordinates) || coordinates.length < 2) return undefined
  const [longitude, latitude] = coordinates
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) return undefined
  return [longitude, latitude]
}

/** Resolve a Japanese prefecture or municipality name without exposing coordinates in the UI. */
export async function resolveLocationName(name: string): Promise<WeatherLocation> {
  const normalizedName = name.trim()
  if (!normalizedName) throw new LocationNotFoundError()

  const params = new URLSearchParams({ q: normalizedName })
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 12_000)

  try {
    const response = await fetch(`${endpoint}?${params}`, { signal: controller.signal })
    if (!response.ok) throw new Error('Location search request failed')
    const payload = await response.json() as unknown
    if (!Array.isArray(payload)) throw new Error('Invalid location search response')

    for (const item of payload) {
      if (item === null || typeof item !== 'object') continue
      const coordinates = coordinatesOf(item as GsiFeature)
      if (!coordinates) continue
      const [longitude, latitude] = coordinates
      return { name: normalizedName, latitude, longitude, timezone: 'Asia/Tokyo' }
    }

    throw new LocationNotFoundError()
  } finally {
    window.clearTimeout(timeoutId)
  }
}
