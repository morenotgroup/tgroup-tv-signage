import { NextResponse } from "next/server";

export const runtime = "nodejs";

type WeatherHourly = {
  timeLabel: string;
  tempC?: number;
  emoji?: string;
  description?: string;
  popPct?: number;
  windKmh?: number;
  uvIndex?: number;
};

type WeatherDaily = {
  dayLabel: string;
  minC?: number;
  maxC?: number;
  emoji?: string;
  description?: string;
  popPct?: number;
  uvMax?: number;
};

type WeatherAlert = {
  label: string;
  kind: "rain" | "uv" | "wind";
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function wmoEmoji(code?: number) {
  const c = Number(code);
  if (!Number.isFinite(c)) return "⛅️";
  if (c === 0) return "☀️";
  if (c === 1 || c === 2) return "⛅️";
  if (c === 3) return "☁️";
  if (c === 45 || c === 48) return "🌫️";
  if ([51, 53, 55, 56, 57].includes(c)) return "🌦️";
  if ([61, 63, 65].includes(c)) return "🌧️";
  if ([66, 67].includes(c)) return "🌧️";
  if ([71, 73, 75, 77].includes(c)) return "❄️";
  if ([80, 81, 82].includes(c)) return "🌧️";
  if ([85, 86].includes(c)) return "❄️";
  if ([95, 96, 99].includes(c)) return "⛈️";
  return "⛅️";
}

function wmoDescPt(code?: number) {
  const c = Number(code);
  if (!Number.isFinite(c)) return "São Paulo";
  if (c === 0) return "Céu limpo";
  if (c === 1) return "Poucas nuvens";
  if (c === 2) return "Parcialmente nublado";
  if (c === 3) return "Nublado";
  if (c === 45 || c === 48) return "Nevoeiro";
  if ([51, 53, 55].includes(c)) return "Garoa";
  if ([61, 63, 65].includes(c)) return "Chuva";
  if ([80, 81, 82].includes(c)) return "Pancadas";
  if ([95, 96, 99].includes(c)) return "Tempestade";
  if ([71, 73, 75, 77, 85, 86].includes(c)) return "Neve";
  return "Tempo instável";
}

function weekdayPtShort(d: Date) {
  const w = d.toLocaleDateString("pt-BR", { weekday: "short" });
  return w.replace(".", "").toLowerCase();
}

function hhmm(d: Date) {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function nearestIndex(times: string[], targetISO: string) {
  // times no formato "2026-02-09T18:00"
  const target = new Date(targetISO).getTime();
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < times.length; i++) {
    const t = new Date(times[i]).getTime();
    const diff = Math.abs(t - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

export async function GET() {
  try {
    // São Paulo (Perdizes aproximado)
    const latitude = -23.55;
    const longitude = -46.63;

    // Open-Meteo (robusto e gratuito)
    const url =
      "https://api.open-meteo.com/v1/forecast" +
      `?latitude=${latitude}&longitude=${longitude}` +
      `&timezone=America%2FSao_Paulo` +
      `&current_weather=true` +
      `&hourly=temperature_2m,relativehumidity_2m,precipitation_probability,weathercode,windspeed_10m,uv_index` +
      `&daily=temperature_2m_max,temperature_2m_min,weathercode,sunrise,sunset,precipitation_probability_max,uv_index_max`;

    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();

    const current = data?.current_weather;
    const hourly = data?.hourly ?? {};
    const daily = data?.daily ?? {};

    const nowISO = current?.time ?? new Date().toISOString();
    const idx = Array.isArray(hourly?.time) ? nearestIndex(hourly.time, nowISO) : 0;

    const tempC = Number(current?.temperature);
    const code = Number(current?.weathercode);

    const humidityPct = Number(hourly?.relativehumidity_2m?.[idx]);
    const windKmh = Number(current?.windspeed ?? hourly?.windspeed_10m?.[idx]);
    const popNowPct = Number(hourly?.precipitation_probability?.[idx]);
    const uvNow = Number(hourly?.uv_index?.[idx]);

    const sunriseISO = Array.isArray(daily?.sunrise) ? daily.sunrise?.[0] : undefined;
    const sunsetISO = Array.isArray(daily?.sunset) ? daily.sunset?.[0] : undefined;

    const sunriseHHMM = sunriseISO ? hhmm(new Date(sunriseISO)) : undefined;
    const sunsetHHMM = sunsetISO ? hhmm(new Date(sunsetISO)) : undefined;

    // hourly cards (próximas 8h a partir do índice atual)
    const hourlyItems: WeatherHourly[] = [];
    if (Array.isArray(hourly?.time)) {
      for (let i = idx; i < Math.min(idx + 8, hourly.time.length); i++) {
        const t = new Date(hourly.time[i]);
        const tLabel = hhmm(t);
        const tTemp = Number(hourly?.temperature_2m?.[i]);
        const tCode = Number(hourly?.weathercode?.[i]);
        const tPop = Number(hourly?.precipitation_probability?.[i]);
        const tWind = Number(hourly?.windspeed_10m?.[i]);
        const tUv = Number(hourly?.uv_index?.[i]);

        hourlyItems.push({
          timeLabel: tLabel,
          tempC: Number.isFinite(tTemp) ? tTemp : undefined,
          emoji: wmoEmoji(tCode),
          description: wmoDescPt(tCode),
          popPct: Number.isFinite(tPop) ? tPop : undefined,
          windKmh: Number.isFinite(tWind) ? tWind : undefined,
          uvIndex: Number.isFinite(tUv) ? tUv : undefined,
        });
      }
    }

    // daily cards (5 dias)
    const dailyItems: WeatherDaily[] = [];
    if (Array.isArray(daily?.time)) {
      for (let i = 0; i < Math.min(5, daily.time.length); i++) {
        const d = new Date(daily.time[i]);
        const maxC = Number(daily?.temperature_2m_max?.[i]);
        const minC = Number(daily?.temperature_2m_min?.[i]);
        const dCode = Number(daily?.weathercode?.[i]);
        const dPop = Number(daily?.precipitation_probability_max?.[i]);
        const dUv = Number(daily?.uv_index_max?.[i]);

        dailyItems.push({
          dayLabel: weekdayPtShort(d),
          maxC: Number.isFinite(maxC) ? maxC : undefined,
          minC: Number.isFinite(minC) ? minC : undefined,
          emoji: wmoEmoji(dCode),
          description: wmoDescPt(dCode),
          popPct: Number.isFinite(dPop) ? dPop : undefined,
          uvMax: Number.isFinite(dUv) ? dUv : undefined,
        });
      }
    }

    // Alertas do dia
    const alerts: WeatherAlert[] = [];
    const popMaxToday = Number(daily?.precipitation_probability_max?.[0]);
    const uvMaxToday = Number(daily?.uv_index_max?.[0]);

    if (Number.isFinite(popMaxToday) && popMaxToday > 60) {
      alerts.push({ kind: "rain", label: "Chuva provável" });
    }
    if (Number.isFinite(uvMaxToday) && uvMaxToday > 7) {
      alerts.push({ kind: "uv", label: "UV alto — evitar sol" });
    }
    if (Number.isFinite(windKmh) && windKmh > 25) {
      alerts.push({ kind: "wind", label: "Vento forte — atenção entrada" });
    }

    // Resumo operacional (1 linha)
    const summaryLine =
      `Hoje: ${Number.isFinite(tempC) ? `${Math.round(tempC)}°C` : "—"}` +
      ` • Chuva ${Number.isFinite(popMaxToday) ? `${Math.round(popMaxToday)}%` : "—"}` +
      ` • Vento ${Number.isFinite(windKmh) ? `${Math.round(windKmh)}km/h` : "—"}` +
      ` • Pôr do sol ${sunsetHHMM ?? "—"}`;

    return NextResponse.json(
      {
        ok: true,
        tempC: Number.isFinite(tempC) ? tempC : undefined,
        emoji: wmoEmoji(code),
        description: `São Paulo • ${wmoDescPt(code)}`,

        humidityPct: Number.isFinite(humidityPct) ? humidityPct : undefined,
        windKmh: Number.isFinite(windKmh) ? windKmh : undefined,
        popNowPct: Number.isFinite(popNowPct) ? popNowPct : undefined,
        uvNow: Number.isFinite(uvNow) ? uvNow : undefined,
        sunriseHHMM,
        sunsetHHMM,

        alerts,
        summaryLine,

        hourly: hourlyItems,
        daily: dailyItems,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch {
    return NextResponse.json({ ok: false }, { headers: { "Cache-Control": "no-store" } });
  }
}