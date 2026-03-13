'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCloudSun,
  faSun,
  faCloud,
  faSmog,
  faCloudRain,
  faCloudShowersHeavy,
  faCloudBolt,
  faSnowflake,
  faDroplet,
  faWind,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

// wttr.in condition → icon mapping
const weatherIconMap: Record<string, IconDefinition> = {
  'Clear': faSun,
  'Sunny': faSun,
  'Partly cloudy': faCloudSun,
  'Cloudy': faCloud,
  'Overcast': faCloud,
  'Mist': faSmog,
  'Fog': faSmog,
  'Light rain': faCloudRain,
  'Rain': faCloudShowersHeavy,
  'Heavy rain': faCloudShowersHeavy,
  'Light drizzle': faCloudRain,
  'Drizzle': faCloudRain,
  'Thunderstorm': faCloudBolt,
  'Snow': faSnowflake,
  'Light snow': faSnowflake,
  'Sleet': faSnowflake,
};

function getWeatherIcon(condition: string): IconDefinition {
  for (const [key, icon] of Object.entries(weatherIconMap)) {
    if (condition.toLowerCase().includes(key.toLowerCase())) return icon;
  }
  return faCloudSun;
}

// Open-Meteo weather code → icon mapping
function getWeatherCodeIcon(code: number): IconDefinition {
  if (code === 0) return faSun;
  if (code >= 1 && code <= 3) return faCloudSun;
  if (code === 45 || code === 48) return faSmog;
  if (code >= 51 && code <= 55) return faCloudRain;
  if (code >= 61 && code <= 65) return faCloudShowersHeavy;
  if (code >= 71 && code <= 77) return faSnowflake;
  if (code >= 80 && code <= 82) return faCloudRain;
  if (code >= 95 && code <= 99) return faCloudBolt;
  return faCloudSun;
}

function getWeatherIconColor(icon: IconDefinition): string {
  if (icon === faSun) return 'text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]';
  if (icon === faCloudSun) return 'text-yellow-300 drop-shadow-[0_0_6px_rgba(253,224,71,0.4)]';
  if (icon === faCloud || icon === faSmog) return 'text-gray-400';
  if (icon === faCloudRain || icon === faCloudShowersHeavy) return 'text-blue-400 drop-shadow-[0_0_6px_rgba(96,165,250,0.4)]';
  if (icon === faCloudBolt) return 'text-yellow-500 drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]';
  if (icon === faSnowflake) return 'text-blue-200 drop-shadow-[0_0_6px_rgba(191,219,254,0.4)]';
  return 'text-white/50';
}

const SHORT_DAY_NAMES = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];

interface WeatherForecastDay {
  dayName: string;
  tempMax: number;
  tempMin: number;
  icon: IconDefinition;
}

interface WeatherState {
  location: string;
  temperature: number;
  feelsLike: number;
  condition: string;
  icon: IconDefinition;
  humidity: number;
  windSpeed: number;
  forecast: WeatherForecastDay[];
}

// Genk coordinates
const GENK_LAT = 50.9652;
const GENK_LON = 5.5004;

function getMockWeather(): WeatherState {
  const today = new Date();
  return {
    location: 'Genk, België',
    temperature: 8,
    feelsLike: 5,
    condition: 'Partly cloudy',
    icon: faCloudSun,
    humidity: 72,
    windSpeed: 15,
    forecast: [1, 2, 3].map((offset) => {
      const d = new Date(today);
      d.setDate(d.getDate() + offset);
      return {
        dayName: SHORT_DAY_NAMES[d.getDay()],
        tempMax: 10 + offset,
        tempMin: 3 + offset,
        icon: [faCloudRain, faCloud, faSun][offset - 1],
      };
    }),
  };
}

export function WeatherWidget({ compact = false }: { compact?: boolean } = {}) {
  const [weather, setWeather] = useState<WeatherState | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchWeather = useCallback(async () => {
    try {
      // Fetch current weather from wttr.in and forecast from Open-Meteo in parallel
      const [wttrRes, meteoRes] = await Promise.all([
        fetch('https://wttr.in/Genk?format=j1'),
        fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${GENK_LAT}&longitude=${GENK_LON}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=Europe/Brussels&forecast_days=4`
        ),
      ]);

      if (!wttrRes.ok) throw new Error('wttr.in API error');
      if (!meteoRes.ok) throw new Error('Open-Meteo API error');

      const [wttrJson, meteoJson] = await Promise.all([wttrRes.json(), meteoRes.json()]);

      // Current weather from wttr.in
      const current = wttrJson.current_condition?.[0];
      const condition = current?.weatherDesc?.[0]?.value || 'Unknown';

      // Forecast from Open-Meteo (skip today = index 0, take next 3 days)
      const daily = meteoJson.daily;
      const forecast: WeatherForecastDay[] = [];

      for (let i = 1; i <= 3; i++) {
        const date = new Date(daily.time[i] + 'T12:00:00');
        forecast.push({
          dayName: SHORT_DAY_NAMES[date.getDay()],
          tempMax: Math.round(daily.temperature_2m_max[i]),
          tempMin: Math.round(daily.temperature_2m_min[i]),
          icon: getWeatherCodeIcon(daily.weathercode[i]),
        });
      }

      setWeather({
        location: 'Genk, België',
        temperature: parseInt(current?.temp_C || '0'),
        feelsLike: parseInt(current?.FeelsLikeC || '0'),
        condition,
        icon: getWeatherIcon(condition),
        humidity: parseInt(current?.humidity || '0'),
        windSpeed: parseInt(current?.windspeedKmph || '0'),
        forecast,
      });
    } catch {
      setWeather(getMockWeather());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWeather();
    const interval = setInterval(fetchWeather, 60000);
    return () => clearInterval(interval);
  }, [fetchWeather]);

  if (loading) {
    return (
      <Card className="h-full border-cyan-500/[0.15]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FontAwesomeIcon icon={faCloudSun} className="h-5 w-5 text-yellow-400" />
            Weer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-10 rounded-xl shimmer" />
            <div className="h-24 rounded-xl shimmer" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!weather) return null;

  // ── Compact mode ──
  if (compact) {
    return (
      <Card className="h-full border-cyan-500/[0.1] hover:shadow-[0_12px_48px_0_rgba(34,211,238,0.08),inset_0_1px_0_0_rgba(255,255,255,0.08)]">
        <CardHeader className="pb-1 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <div className="p-1 rounded-lg bg-cyan-500/[0.1] glow-cyan">
                <FontAwesomeIcon icon={faCloudSun} className="h-3.5 w-3.5 text-cyan-400" />
              </div>
              <span className="text-sm">Weer</span>
            </CardTitle>
            <Badge variant="outline" className="text-[10px] text-white/40">
              {weather.location}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4 pt-1">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-3xl font-bold tracking-tight text-white/95">
                {weather.temperature}°C
              </p>
              <p className="text-xs text-white/40 mt-0.5">
                Voelt als {weather.feelsLike}°C · {weather.condition}
              </p>
            </div>
            <FontAwesomeIcon
              icon={weather.icon}
              className={`h-10 w-10 ${getWeatherIconColor(weather.icon)}`}
            />
          </div>
          {/* Compact stats + forecast row */}
          <div className="flex items-center justify-between mt-2">
            <div className="flex gap-3 text-xs text-white/40">
              <span className="flex items-center gap-1">
                <FontAwesomeIcon icon={faDroplet} className="h-2.5 w-2.5 text-blue-400" />
                {weather.humidity}%
              </span>
              <span className="flex items-center gap-1">
                <FontAwesomeIcon icon={faWind} className="h-2.5 w-2.5 text-gray-400" />
                {weather.windSpeed} km/h
              </span>
            </div>
            <div className="flex gap-2">
              {weather.forecast.map((day) => (
                <div key={day.dayName} className="text-center">
                  <p className="text-[10px] text-white/35">{day.dayName}</p>
                  <FontAwesomeIcon icon={day.icon} className={`h-3 w-3 my-0.5 ${getWeatherIconColor(day.icon)}`} />
                  <p className="text-[10px] text-white/60">{day.tempMax}°</p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Full mode (original) ──
  return (
    <Card className="h-full border-cyan-500/[0.1] hover:shadow-[0_12px_48px_0_rgba(34,211,238,0.08),inset_0_1px_0_0_rgba(255,255,255,0.08)]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-xl bg-cyan-500/[0.1] glow-cyan">
              <FontAwesomeIcon icon={faCloudSun} className="h-4 w-4 text-cyan-400" />
            </div>
            <span>Weer</span>
          </CardTitle>
          <Badge variant="outline" className="text-xs text-white/45">
            {weather.location}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Weather */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-5xl font-bold tracking-tight text-white/95">
              {weather.temperature}°C
            </p>
            <p className="text-sm text-white/45 mt-1">
              Voelt als {weather.feelsLike}°C
            </p>
          </div>
          <div className="text-right">
            <FontAwesomeIcon
              icon={weather.icon}
              className={`h-14 w-14 ${getWeatherIconColor(weather.icon)}`}
            />
            <p className="text-sm text-white/50 mt-1">{weather.condition}</p>
          </div>
        </div>

        {/* Details */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.04]">
            <p className="text-white/45 flex items-center gap-1.5 text-xs">
              <FontAwesomeIcon icon={faDroplet} className="h-3.5 w-3.5 text-blue-400" />
              Luchtvochtigheid
            </p>
            <p className="font-semibold text-white/90 mt-0.5">{weather.humidity}%</p>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.04]">
            <p className="text-white/45 flex items-center gap-1.5 text-xs">
              <FontAwesomeIcon icon={faWind} className="h-3.5 w-3.5 text-gray-400" />
              Wind
            </p>
            <p className="font-semibold text-white/90 mt-0.5">{weather.windSpeed} km/h</p>
          </div>
        </div>

        {/* 3-Day Forecast */}
        <div className="border-t border-white/[0.06] pt-4">
          <p className="text-xs font-medium text-white/50 uppercase tracking-wider mb-3">Vooruitzicht</p>
          <div className="grid grid-cols-3 gap-2">
            {weather.forecast.map((day) => (
              <div
                key={day.dayName}
                className="text-center p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] backdrop-blur-sm transition-all duration-200 hover:bg-white/[0.06] hover:border-white/[0.08]"
              >
                <p className="text-xs font-medium text-white/50 mb-1.5">{day.dayName}</p>
                <FontAwesomeIcon
                  icon={day.icon}
                  className={`h-6 w-6 my-1.5 ${getWeatherIconColor(day.icon)}`}
                />
                <p className="text-sm font-bold text-white/90 mt-1.5">{day.tempMax}°</p>
                <p className="text-xs text-white/35">{day.tempMin}°</p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
