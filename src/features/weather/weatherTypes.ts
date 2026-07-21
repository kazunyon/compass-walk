import type { CachedWeather, Weather, WeatherData, WeatherLocation } from '../../types'
export type { CachedWeather, Weather, WeatherData, WeatherLocation }
export const weatherLabels: Record<Weather, string> = { sunny: '晴れ', cloudy: '曇り', rainy: '雨', snowy: '雪', unset: '未登録' }
export const weatherIcons: Record<Weather, string> = { sunny: '☀', cloudy: '☁', rainy: '🌧️', snowy: '❄️', unset: '－' }
const weatherValues: readonly Weather[] = ['sunny', 'cloudy', 'rainy', 'snowy', 'unset']

/** Accept persisted IndexedDB values defensively: older/corrupt entries can be null. */
export const isWeatherData = (weather: unknown): weather is WeatherData =>
  weather !== null && typeof weather === 'object' &&
  weatherValues.includes((weather as { value?: unknown }).value as Weather) &&
  ((weather as { source?: unknown }).source === 'auto' || (weather as { source?: unknown }).source === 'manual')

export const weatherValue = (weather: unknown): Weather => {
  if (typeof weather === 'string' && weatherValues.includes(weather as Weather)) return weather as Weather
  return isWeatherData(weather) ? weather.value : 'unset'
}

export const weatherData = (weather: unknown): WeatherData | undefined => isWeatherData(weather) ? weather : undefined

/** Stored weather can outlive app versions; only show safe numeric values from it. */
export const weatherMetric = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined
