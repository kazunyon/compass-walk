import { weatherFromCode } from './weatherCode'
import type { WeatherData, WeatherLocation } from './weatherTypes'

const endpoint = 'https://api.open-meteo.com/v1/forecast'
type ApiResponse = { daily?: { time?: string[]; weather_code?: number[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_probability_max?: number[] } } | null

/** Safari-compatible request timeout. AbortSignal.timeout is not available on older iOS Safari. */
export async function fetchWeather(location: WeatherLocation, date: string): Promise<WeatherData> {
  const params = new URLSearchParams({ latitude: String(location.latitude), longitude: String(location.longitude), daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max', timezone: location.timezone || 'Asia/Tokyo', start_date: date, end_date: date })
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 12_000)
  try {
    const response = await fetch(`${endpoint}?${params}`, { signal: controller.signal })
    if (!response.ok) throw new Error('Open-Meteo request failed')
    const payload = await response.json() as ApiResponse
    const daily = payload?.daily
    const code = daily?.weather_code?.[0]
    if (!daily?.time?.length || typeof code !== 'number') throw new Error('Weather data unavailable')
    return { value: weatherFromCode(code), source: 'auto', fetchedAt: new Date().toISOString(), temperatureMax: daily.temperature_2m_max?.[0], temperatureMin: daily.temperature_2m_min?.[0], precipitationProbability: daily.precipitation_probability_max?.[0] }
  } finally { window.clearTimeout(timeoutId) }
}