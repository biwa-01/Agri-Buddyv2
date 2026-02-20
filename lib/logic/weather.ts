import type { OutdoorWeather } from '@/lib/types';

export function weatherDesc(c: number) { return c === 0 ? '快晴' : c <= 3 ? '晴れ' : c <= 49 ? '曇り' : c <= 69 ? '雨' : c <= 79 ? '雪' : '荒天'; }

export async function fetchWeather(): Promise<OutdoorWeather> {
  try {
    const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=32.75&longitude=129.87&current_weather=true&timezone=Asia/Tokyo');
    const d = await r.json(); const c = d.current_weather;
    return { description: weatherDesc(c.weathercode), temperature: c.temperature, code: c.weathercode };
  } catch { return { description: '取得失敗', temperature: 0, code: -1 }; }
}

export async function fetchTomorrowWeather(): Promise<{ description: string; maxTemp: number; minTemp: number } | null> {
  try {
    const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=32.75&longitude=129.87&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=Asia/Tokyo&forecast_days=2');
    const d = await r.json();
    return {
      description: weatherDesc(d.daily.weathercode[1]),
      maxTemp: d.daily.temperature_2m_max[1],
      minTemp: d.daily.temperature_2m_min[1],
    };
  } catch { return null; }
}
