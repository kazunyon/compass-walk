import db from '../../db'
import type { CachedWeather, WeatherLocation } from './weatherTypes'
import { fetchWeather } from './weatherApi'
import { isWeatherData } from './weatherTypes'

export async function getWeatherForDate(location: WeatherLocation, date: string, force = false): Promise<CachedWeather> {
  const cached = await db.weatherCache.where('[locationId+date]').equals(['default', date]).first()
  const today = new Date().toISOString().slice(0, 10)
  if (!force && cached && isWeatherData(cached) && cached.fetchedAt?.slice(0, 10) === today) return cached
  const weather = await fetchWeather(location, date)
  if (!isWeatherData(weather)) throw new Error('Weather conversion failed')
  const item: CachedWeather = { ...weather, locationId: 'default', date }
  await db.weatherCache.put(item)
  return item
}