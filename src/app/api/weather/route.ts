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

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function weekdayPtShortFromISO(iso: string) {
  const d = new Date(iso);
  const w = d.toLocaleDateString("pt-BR", { weekday: "short" });
  return w.replace(".", "").toLowerCase();
}

export async function GET() {
  const cfg = SIGNAGE_CONFIG as any;

  // Perdizes aproximado (se não setar env/config, já fica aceitável)
  const latitude =
    (process.env.WEATHER_LAT && Number(process.env.WEATHER_LAT)) ||
    (typeof cfg.latitude === "number" ? cfg.latitude : undefined) ||
    -23.545;

  const longitude =
    (process.env.WEATHER_LON && Number(process.env.WEATHER_LON)) ||
    (typeof cfg.longitude === "number" ? cfg.longitude : undefined) ||
    -46.676;

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

    const tempC = Number(json?.current?.temperature_2m);
    const code = Number(json?.current?.weather_code);

    // hourly (pega próximas 8 horas a partir do "agora")
    const hourlyTimes: string[] = json?.hourly?.time ?? [];
    const hourlyTemps: number[] = json?.hourly?.temperature_2m ?? [];
    const hourlyCodes: number[] = json?.hourly?.weather_code ?? [];

    const now = new Date();
    const nowHourIsoPrefix = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}T${pad2(now.getHours())}:`;

    let startIdx = hourlyTimes.findIndex((t) => t.startsWith(nowHourIsoPrefix));
    if (startIdx < 0) startIdx = 0;

    const hourly = Array.from({ length: 8 }).map((_, i) => {
      const idx = startIdx + i;
      const t = hourlyTimes[idx];
      const hh = t ? t.slice(11, 16) : "--:--";
      const tc = Number(hourlyTemps[idx]);
      const wc = Number(hourlyCodes[idx]);
      return {
        timeLabel: hh,
        tempC: Number.isFinite(tc) ? tc : undefined,
        emoji: Number.isFinite(wc) ? codeToEmoji(wc) : "⛅️",
        description: Number.isFinite(wc) ? codeToDescPt(wc) : "São Paulo",
      };
    });

    // daily (próximos 5 dias)
    const dailyTimes: string[] = json?.daily?.time ?? [];
    const dailyMax: number[] = json?.daily?.temperature_2m_max ?? [];
    const dailyMin: number[] = json?.daily?.temperature_2m_min ?? [];
    const dailyCodes: number[] = json?.daily?.weather_code ?? [];

    const daily = dailyTimes.slice(0, 5).map((t, i) => {
      const maxC = Number(dailyMax[i]);
      const minC = Number(dailyMin[i]);
      const wc = Number(dailyCodes[i]);
      return {
        dayLabel: weekdayPtShortFromISO(t),
        maxC: Number.isFinite(maxC) ? maxC : undefined,
        minC: Number.isFinite(minC) ? minC : undefined,
        emoji: Number.isFinite(wc) ? codeToEmoji(wc) : "⛅️",
        description: Number.isFinite(wc) ? codeToDescPt(wc) : "São Paulo",
      };
    });

    return NextResponse.json(
      {
        ok: true,
        tempC: Number.isFinite(tempC) ? tempC : undefined,
        description: Number.isFinite(code) ? codeToDescPt(code) : "São Paulo",
        emoji: Number.isFinite(code) ? codeToEmoji(code) : "⛅️",
        hourly,
        daily,
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