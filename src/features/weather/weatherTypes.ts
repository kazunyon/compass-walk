import type { CachedWeather, Weather, WeatherData, WeatherLocation } from '../../types'
export type { CachedWeather, Weather, WeatherData, WeatherLocation }
export const weatherLabels: Record<Weather, string> = { sunny: '晴れ', cloudy: '曇り', rainy: '雨', snowy: '雪', unset: '未登録' }
export const weatherIcons: Record<Weather, string> = { sunny: '☀', cloudy: '☁', rainy: '☂', snowy: '❄', unset: '－' }
export const weatherValue = (weather: Weather | WeatherData | undefined): Weather => typeof weather === 'string' ? weather : weather?.value ?? 'unset'
export const weatherData = (weather: Weather | WeatherData | undefined): WeatherData | undefined => typeof weather === 'object' ? weather : undefined