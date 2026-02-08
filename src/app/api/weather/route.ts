export const runtime = "edge";

export async function GET() {
  // São Paulo (centro) — ajuste depois se quiser
  const lat = -23.55052;
  const lon = -46.63331;

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code&timezone=America%2FSao_Paulo`;

  const r = await fetch(url, { next: { revalidate: 600 } }); // cache 10 min
  if (!r.ok) return new Response("weather error", { status: 500 });

  const j = await r.json();
  const tempC = j?.current?.temperature_2m ?? null;
  const code = j?.current?.weather_code ?? null;

  const summary = codeToPtBR(code);

  return Response.json({ tempC, summary });
}

function codeToPtBR(code: number | null) {
  if (code == null) return "—";
  // Mapa simplificado (depois refinamos)
  if ([0].includes(code)) return "Céu limpo";
  if ([1, 2, 3].includes(code)) return "Parcialmente nublado";
  if ([45, 48].includes(code)) return "Neblina";
  if ([51, 53, 55, 61, 63, 65].includes(code)) return "Chuva";
  if ([71, 73, 75].includes(code)) return "Neve (raro)";
  if ([95, 96, 99].includes(code)) return "Tempestade";
  return "Tempo instável";
}
