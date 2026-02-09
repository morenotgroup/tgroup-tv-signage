import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function weekdayPtShort(d: Date) {
  const w = d.toLocaleDateString("pt-BR", { weekday: "short" });
  return w.replace(".", "").toLowerCase();
}

function weatherCodeToEmojiDesc(code: number): { emoji: string; description: string } {
  // mapping básico e bonito (o suficiente pra signage)
  if (code === 0) return { emoji: "☀️", description: "Céu limpo" };
  if ([1, 2].includes(code)) return { emoji: "⛅️", description: "Parcialmente nublado" };
  if (code === 3) return { emoji: "☁️", description: "Nublado" };
  if ([45, 48].includes(code)) return { emoji: "🌫️", description: "Neblina" };
  if ([51, 53, 55].includes(code)) return { emoji: "🌦️", description: "Garoa" };
  if ([61, 63, 65].includes(code)) return { emoji: "🌧️", description: "Chuva" };
  if ([66, 67].includes(code)) return { emoji: "🌧️", description: "Chuva gelada" };
  if ([71, 73, 75, 77].includes(code)) return { emoji: "❄️", description: "Neve" };
  if ([80, 81, 82].includes(code)) return { emoji: "🌧️", description: "Pancadas" };
  if ([95].includes(code)) return { emoji: "⛈️", description: "Trovoadas" };
  if ([96, 99].includes(code)) return { emoji: "⛈️", description: "Tempestade" };
  return { emoji: "⛅️", description: "Clima" };
}

export async function GET() {
  // Perdizes / São Paulo (ajustável depois)
  const lat = -23.55;
  const lon = -46.65;
  const tz = "America/Sao_Paulo";

  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lat}&longitude=${lon}` +
    `&timezone=${encodeURIComponent(tz)}` +
    `&current=temperature_2m,weather_code` +
    `&hourly=temperature_2m,precipitation_probability,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,uv_index_max,windspeed_10m_max,sunset` +
    `&forecast_days=7`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();

    const currentTemp = Number(data?.current?.temperature_2m);
    const currentCode = Number(data?.current?.weather_code);

    const { emoji, description } = weatherCodeToEmojiDesc(Number.isFinite(currentCode) ? currentCode : 2);

    // hourly (próximas 8)
    const hourlyTime: string[] = data?.hourly?.time ?? [];
    const hourlyTemp: number[] = data?.hourly?.temperature_2m ?? [];
    const hourlyCode: number[] = data?.hourly?.weather_code ?? [];

    const nowISO: string = data?.current?.time ?? new Date().toISOString();
    const nowT = new Date(nowISO).getTime();

    let startIdx = 0;
    for (let i = 0; i < hourlyTime.length; i++) {
      const t = new Date(hourlyTime[i]).getTime();
      if (t >= nowT) {
        startIdx = i;
        break;
      }
    }

    const hourly = Array.from({ length: 8 }).map((_, i) => {
      const idx = startIdx + i;
      const t = hourlyTime[idx] ? new Date(hourlyTime[idx]) : null;
      const label = t
        ? t.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
        : "--:--";
      const tempC = Number.isFinite(Number(hourlyTemp[idx])) ? Number(hourlyTemp[idx]) : undefined;
      const code = Number.isFinite(Number(hourlyCode[idx])) ? Number(hourlyCode[idx]) : 2;
      const m = weatherCodeToEmojiDesc(code);

      return {
        timeLabel: label,
        tempC,
        emoji: m.emoji,
        description: m.description,
      };
    });

    // daily (próximos 5)
    const dailyTime: string[] = data?.daily?.time ?? [];
    const dailyMax: number[] = data?.daily?.temperature_2m_max ?? [];
    const dailyMin: number[] = data?.daily?.temperature_2m_min ?? [];
    const dailyCode: number[] = data?.daily?.weather_code ?? [];

    const daily = dailyTime.slice(0, 5).map((t: string, i: number) => {
      const d = new Date(t);
      const code = Number.isFinite(Number(dailyCode[i])) ? Number(dailyCode[i]) : 2;
      const m = weatherCodeToEmojiDesc(code);
      return {
        dayLabel: weekdayPtShort(d),
        minC: Number.isFinite(Number(dailyMin[i])) ? Number(dailyMin[i]) : undefined,
        maxC: Number.isFinite(Number(dailyMax[i])) ? Number(dailyMax[i]) : undefined,
        emoji: m.emoji,
        description: m.description,
      };
    });

    // extras (hoje)
    const popTodayMax = Number(data?.daily?.precipitation_probability_max?.[0]);
    const uvTodayMax = Number(data?.daily?.uv_index_max?.[0]);
    const windTodayMaxKmh = Number(data?.daily?.windspeed_10m_max?.[0]);

    const sunsetRaw = data?.daily?.sunset?.[0];
    const sunsetTime =
      sunsetRaw ? new Date(sunsetRaw).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : undefined;

    return NextResponse.json(
      {
        ok: true,
        tempC: Number.isFinite(currentTemp) ? currentTemp : undefined,
        emoji,
        description: `São Paulo • ${description}`,
        hourly,
        daily,
        popTodayMax: Number.isFinite(popTodayMax) ? popTodayMax : undefined,
        uvTodayMax: Number.isFinite(uvTodayMax) ? uvTodayMax : undefined,
        windTodayMaxKmh: Number.isFinite(windTodayMaxKmh) ? windTodayMaxKmh : undefined,
        sunsetTime,
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ ok: false }, { headers: { "cache-control": "no-store" } });
  }
}
