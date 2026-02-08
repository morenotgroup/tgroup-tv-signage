export const runtime = "edge";

export async function GET() {
  // Query ampla e neutra (pt). Depois a gente personaliza por interesses (tecnologia, cultura, SP, etc.)
  const query = encodeURIComponent("Sao Paulo OR Brasil");
  const url =
    `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}` +
    `&mode=ArtList&format=json&maxrecords=12&sort=HybridRel`;

  const r = await fetch(url, { next: { revalidate: 1800 } }); // 30 min
  if (!r.ok) return new Response("news error", { status: 500 });

  const j = await r.json();
  const articles =
    (j?.articles ?? []).map((a: any) => ({
      title: a?.title,
      url: a?.url,
      source: a?.sourceCountry,
    })) ?? [];

  return Response.json({ articles });
}
