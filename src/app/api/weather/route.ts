import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WeatherHourly = {
  timeLabel: string;
  tempC?: number;
  emoji?: string;
  description?: string;
  precipProbPct?: number;
  precipMm?: number;
};

type WeatherDaily = {
  dayLabel: string;
  minC?: number;
  maxC?: number;
  emoji?: string;
  description?: string;
  precipProbPct?: number;
  sunrise?: string;
  sunset?: string;
  uvMax?: number;
};

type WeatherPayload = {
  ok: boolean;
  tempC?: number;
  feelsLikeC?: number;
  humidityPct?: number;
  windKph?: number;
  windDirDeg?: number;
  precipMmNow?: number;
  precipProbNowPct?: number;
  cloudPct?: number;

  emoji?: string;
  description?: string;

  sunrise?: string;
  sunset?: string;
  uvMaxToday?: number;

  hourly?: WeatherHourly[];
  daily?: WeatherDaily[];
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeNumber(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function toHHMM(iso?: string) {
  if (!iso) return undefined;
  const m = iso.match(/T(\d{2}):(\d{2})/);
  if (!m) return undefined;
  return `${m[1]}:${m[2]}`;
}

function weekdayPtShort(dateIso?: string) {
  if (!dateIso) return "—";
  const d = new Date(dateIso + "T12:00:00");
  const w = d.toLocaleDateString("pt-BR", { weekday: "short" });
  return w.replace(".", "").toLowerCase();
}

// Open-Meteo weather codes (simplificado)
function codeToEmojiDesc(code?: number) {
  const c = Number(code);
  if (!Number.isFinite(c)) return { emoji: "⛅️", desc: "Tempo variável" };

  if (c === 0) return { emoji: "☀️", desc: "Céu limpo" };
  if (c === 1) return { emoji: "🌤️", desc: "Poucas nuvens" };
  if (c === 2) return { emoji: "⛅️", desc: "Parcialmente nublado" };
  if (c === 3) return { emoji: "☁️", desc: "Nublado" };

  if ([45, 48].includes(c)) return { emoji: "🌫️", desc: "Neblina" };

  if ([51, 53, 55].includes(c)) return { emoji: "🌦️", desc: "Garoa" };
  if ([56, 57].includes(c)) return { emoji: "🌧️", desc: "Garoa congelante" };

  if ([61, 63, 65].includes(c)) return { emoji: "🌧️", desc: "Chuva" };
  if ([66, 67].includes(c)) return { emoji: "🌧️", desc: "Chuva congelante" };

  if ([71, 73, 75].includes(c)) return { emoji: "🌨️", desc: "Neve" };
  if (c === 77) return { emoji: "❄️", desc: "Neve granular" };

  if ([80, 81, 82].includes(c)) return { emoji: "🌧️", desc: "Pancadas" };
  if ([85, 86].includes(c)) return { emoji: "🌨️", desc: "Pancadas de neve" };

  if (c === 95) return { emoji: "⛈️", desc: "Trovoadas" };
  if ([96, 99].includes(c)) return { emoji: "⛈️", desc: "Tempestade" };

  return { emoji: "⛅️", desc: "Tempo variável" };
}

async function fetchJson(url: string, timeoutMs = 6500) {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal, cache: "no-store" });
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

export async function GET() {
  try {
    // Perdizes (aprox). Se quiser, depois a gente amarra com cfg/env.
    const lat = -23.536;
    const lon = -46.676;

    const url =
      "https://api.open-meteo.com/v1/forecast" +
      `?latitude=${lat}&longitude=${lon}` +
      "&timezone=America%2FSao_Paulo" +
      "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,precipitation,cloud_cover" +
      "&hourly=temperature_2m,weather_code,precipitation_probability,precipitation" +
      "&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,sunrise,sunset,uv_index_max";

    const data = await fetchJson(url);

    const cur = data?.current ?? {};
    const currentCode = safeNumber(cur?.weather_code);
    const currentWx = codeToEmojiDesc(currentCode);

    const tempC = safeNumber(cur?.temperature_2m);
    const feelsLikeC = safeNumber(cur?.apparent_temperature);
    const humidityPct = safeNumber(cur?.relative_humidity_2m);
    const windKph = safeNumber(cur?.wind_speed_10m);
    const windDirDeg = safeNumber(cur?.wind_direction_10m);
    const precipMmNow = safeNumber(cur?.precipitation);
    const cloudPct = safeNumber(cur?.cloud_cover);

    // hourly (pega próximas 10)
    const h = data?.hourly ?? {};
    const ht: string[] = Array.isArray(h?.time) ? h.time : [];
    const htemp: any[] = Array.isArray(h?.temperature_2m) ? h.temperature_2m : [];
    const hcode: any[] = Array.isArray(h?.weather_code) ? h.weather_code : [];
    const hpop: any[] = Array.isArray(h?.precipitation_probability) ? h.precipitation_probability : [];
    const hprec: any[] = Array.isArray(h?.precipitation) ? h.precipitation : [];

    const hourly: WeatherHourly[] = ht.slice(0, 14).map((t, i) => {
      const m = t.match(/T(\d{2}):(\d{2})/);
      const label = m ? `${m[1]}:${m[2]}` : "—";
      const wx = codeToEmojiDesc(safeNumber(hcode[i]));
      return {
        timeLabel: label,
        tempC: safeNumber(htemp[i]),
        emoji: wx.emoji,
        description: wx.desc,
        precipProbPct: safeNumber(hpop[i]),
        precipMm: safeNumber(hprec[i]),
      };
    });

    // daily (5 dias)
    const d = data?.daily ?? {};
    const dt: string[] = Array.isArray(d?.time) ? d.time : [];
    const dmax: any[] = Array.isArray(d?.temperature_2m_max) ? d.temperature_2m_max : [];
    const dmin: any[] = Array.isArray(d?.temperature_2m_min) ? d.temperature_2m_min : [];
    const dcode: any[] = Array.isArray(d?.weather_code) ? d.weather_code : [];
    const dpop: any[] = Array.isArray(d?.precipitation_probability_max) ? d.precipitation_probability_max : [];
    const dsunrise: any[] = Array.isArray(d?.sunrise) ? d.sunrise : [];
    const dsunset: any[] = Array.isArray(d?.sunset) ? d.sunset : [];
    const duv: any[] = Array.isArray(d?.uv_index_max) ? d.uv_index_max : [];

    const daily: WeatherDaily[] = dt.slice(0, 7).map((t, i) => {
      const wx = codeToEmojiDesc(safeNumber(dcode[i]));
      return {
        dayLabel: weekdayPtShort(t),
        maxC: safeNumber(dmax[i]),
        minC: safeNumber(dmin[i]),
        emoji: wx.emoji,
        description: wx.desc,
        precipProbPct: safeNumber(dpop[i]),
        sunrise: toHHMM(dsunrise[i]),
        sunset: toHHMM(dsunset[i]),
        uvMax: safeNumber(duv[i]),
      };
    });

    // infos do dia (primeiro daily)
    const sunrise = daily?.[0]?.sunrise;
    const sunset = daily?.[0]?.sunset;
    const uvMaxToday = daily?.[0]?.uvMax;
    const precipProbNowPct = hourly?.[0]?.precipProbPct;

    const payload: WeatherPayload = {
      ok: true,
      tempC,
      feelsLikeC,
      humidityPct,
      windKph,
      windDirDeg,
      precipMmNow,
      precipProbNowPct: typeof precipProbNowPct === "number" ? clamp(precipProbNowPct, 0, 100) : undefined,
      cloudPct,

      emoji: currentWx.emoji,
      description: currentWx.desc,

      sunrise,
      sunset,
      uvMaxToday,

      hourly: hourly.slice(0, 10),
      daily: daily.slice(0, 6),
    };

    return NextResponse.json(payload);
  } catch {
    const payload: WeatherPayload = { ok: false };
    return NextResponse.json(payload);
  }
}
