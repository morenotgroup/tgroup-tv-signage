import { NextResponse } from "next/server";
import { SIGNAGE_CONFIG } from "@/config";

export const runtime = "nodejs";

function codeToEmoji(code: number) {
  if (code === 0) return "☀️";
  if ([1, 2].includes(code)) return "🌤️";
  if (code === 3) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([51, 53, 55, 56, 57].includes(code)) return "🌦️";
  if ([61, 63, 65, 66, 67].includes(code)) return "🌧️";
  if ([71, 73, 75, 77].includes(code)) return "❄️";
  if ([80, 81, 82].includes(code)) return "🌧️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "⛅️";
}

function codeToDescPt(code: number) {
  if (code === 0) return "Céu limpo";
  if ([1, 2].includes(code)) return "Poucas nuvens";
  if (code === 3) return "Nublado";
  if ([45, 48].includes(code)) return "Neblina";
  if ([51, 53, 55].includes(code)) return "Garoa";
  if ([56, 57].includes(code)) return "Garoa congelante";
  if ([61, 63, 65].includes(code)) return "Chuva";
  if ([66, 67].includes(code)) return "Chuva congelante";
  if ([71, 73, 75, 77].includes(code)) return "Neve";
  if ([80, 81, 82].includes(code)) return "Pancadas de chuva";
  if ([95, 96, 99].includes(code)) return "Tempestade";
  return "São Paulo";
}

function num(v: any): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET() {
  const cfg = SIGNAGE_CONFIG as any;

  // Perdizes (aprox) — se quiser precisão total, setar env WEATHER_LAT / WEATHER_LON
  const defaultLat = -23.5349;
  const defaultLon = -46.6760;

  const latitude =
    (process.env.WEATHER_LAT && Number(process.env.WEATHER_LAT)) ||
    (typeof cfg.latitude === "number" ? cfg.latitude : undefined) ||
    defaultLat;

  const longitude =
    (process.env.WEATHER_LON && Number(process.env.WEATHER_LON)) ||
    (typeof cfg.longitude === "number" ? cfg.longitude : undefined) ||
    defaultLon;

  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${encodeURIComponent(latitude)}` +
    `&longitude=${encodeURIComponent(longitude)}` +
    `&current=temperature_2m,weather_code` +
    `&hourly=temperature_2m,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
    `&forecast_days=7` +
    `&timezone=America%2FSao_Paulo`;

  try {
    const res = await fetch(url, { next: { revalidate: 600 } });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Weather fetch failed (${res.status})` },
        { status: 502 }
      );
    }

    const json = await res.json();

    const tempC = num(json?.current?.temperature_2m);
    const code = num(json?.current?.weather_code);

    const hourlyTime: string[] = Array.isArray(json?.hourly?.time) ? json.hourly.time : [];
    const hourlyTemp: any[] = Array.isArray(json?.hourly?.temperature_2m) ? json.hourly.temperature_2m : [];
    const hourlyCode: any[] = Array.isArray(json?.hourly?.weather_code) ? json.hourly.weather_code : [];

    const hourly = hourlyTime.slice(0, 96).map((time, i) => {
      const t = num(hourlyTemp[i]);
      const c = num(hourlyCode[i]);
      return {
        time,
        tempC: t,
        description: c !== undefined ? codeToDescPt(c) : undefined,
        emoji: c !== undefined ? codeToEmoji(c) : undefined,
      };
    });

    const dailyTime: string[] = Array.isArray(json?.daily?.time) ? json.daily.time : [];
    const dailyMax: any[] = Array.isArray(json?.daily?.temperature_2m_max) ? json.daily.temperature_2m_max : [];
    const dailyMin: any[] = Array.isArray(json?.daily?.temperature_2m_min) ? json.daily.temperature_2m_min : [];
    const dailyCode: any[] = Array.isArray(json?.daily?.weather_code) ? json.daily.weather_code : [];

    const daily = dailyTime.slice(0, 7).map((date, i) => {
      const maxC = num(dailyMax[i]);
      const minC = num(dailyMin[i]);
      const c = num(dailyCode[i]);
      return {
        date,
        maxC,
        minC,
        description: c !== undefined ? codeToDescPt(c) : undefined,
        emoji: c !== undefined ? codeToEmoji(c) : undefined,
      };
    });

    return NextResponse.json(
      {
        ok: true,
        // backward compat
        tempC: tempC,
        description: code !== undefined ? codeToDescPt(code) : "São Paulo",
        emoji: code !== undefined ? codeToEmoji(code) : "⛅️",

        current: {
          tempC: tempC,
          description: code !== undefined ? codeToDescPt(code) : "São Paulo",
          emoji: code !== undefined ? codeToEmoji(code) : "⛅️",
        },
        hourly,
        daily,
        source: "open_meteo",
        latitude,
        longitude,
      },
      { headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=1200" } }
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "Weather fetch failed (network error)" },
      { status: 502 }
    );
  }
}