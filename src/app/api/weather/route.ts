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

export async function GET() {
  const cfg = SIGNAGE_CONFIG as any;

  const latitude =
    (process.env.WEATHER_LAT && Number(process.env.WEATHER_LAT)) ||
    (typeof cfg.latitude === "number" ? cfg.latitude : undefined) ||
    -23.55052;

  const longitude =
    (process.env.WEATHER_LON && Number(process.env.WEATHER_LON)) ||
    (typeof cfg.longitude === "number" ? cfg.longitude : undefined) ||
    -46.63331;

  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${encodeURIComponent(latitude)}` +
    `&longitude=${encodeURIComponent(longitude)}` +
    `&current=temperature_2m,weather_code` +
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

    const tempC = Number(json?.current?.temperature_2m);
    const code = Number(json?.current?.weather_code);

    return NextResponse.json(
      {
        ok: true,
        tempC: Number.isFinite(tempC) ? tempC : undefined,
        description: Number.isFinite(code) ? codeToDescPt(code) : "São Paulo",
        emoji: Number.isFinite(code) ? codeToEmoji(code) : "⛅️",
        source: "open_meteo",
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
