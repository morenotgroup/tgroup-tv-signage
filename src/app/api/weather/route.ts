import { NextResponse } from "next/server";
import { SIGNAGE_CONFIG } from "@/config";

export const runtime = "nodejs";

export async function GET() {
  const { latitude, longitude } = SIGNAGE_CONFIG;

  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${latitude}&longitude=${longitude}` +
    "&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code" +
    "&timezone=America%2FSao_Paulo";

  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: `Weather fetch failed (${res.status})` },
      { status: 500 }
    );
  }

  const data = await res.json();

  return NextResponse.json(
    { ok: true, data },
    { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" } }
  );
}
