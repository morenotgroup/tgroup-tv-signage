import { NextResponse } from "next/server";

export type RadioProfileId = "agency" | "focus" | "chill";

type Station = {
  id: string;
  name: string;
  streamUrl: string;
  favicon?: string;
  country?: string;
  codec?: string;
  bitrate?: number;
};

const PROFILE_TAGS: Record<RadioProfileId, { label: string; tags: string[] }> = {
  agency: {
    label: "Agência",
    tags: ["dance", "electronic", "house", "pop", "hits", "top 40"],
  },
  focus: {
    label: "Focus",
    tags: ["lofi", "study", "focus", "ambient", "downtempo"],
  },
  chill: {
    label: "Chill",
    tags: ["chill", "lounge", "relax", "chillout", "ambient"],
  },
};

// lista simples de mirrors (estável o suficiente pra começar)
const MIRRORS = [
  "https://de1.api.radio-browser.info",
  "https://fr1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
];

function normProfile(p: string | null): RadioProfileId {
  if (p === "agency" || p === "focus" || p === "chill") return p;
  return "agency";
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function safeStr(x: unknown) {
  return typeof x === "string" ? x.trim() : "";
}

function isHttpsUrl(s: string) {
  return s.startsWith("https://");
}

async function fetchJson(url: string, timeoutMs: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: {
        "User-Agent": "tgroup-tv-signage/1.0 (Next.js on Vercel)",
      },
    });

    if (!r.ok) {
      throw new Error(`HTTP_${r.status}`);
    }

    return (await r.json()) as any[];
  } finally {
    clearTimeout(t);
  }
}

function uniqById(items: Station[]) {
  const seen = new Set<string>();
  const out: Station[] = [];
  for (const it of items) {
    if (!it.id) continue;
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return out;
}

async function queryStations(base: string, profile: RadioProfileId, limit: number) {
  const tags = PROFILE_TAGS[profile].tags;
  const perTag = Math.max(10, Math.ceil(limit / Math.max(1, tags.length)));

  const collected: Station[] = [];

  for (const tag of tags) {
    const u = new URL("/json/stations/search", base);
    u.searchParams.set("hidebroken", "true");
    u.searchParams.set("order", "votes");
    u.searchParams.set("reverse", "true");
    u.searchParams.set("limit", String(perTag));
    u.searchParams.set("tag", tag);

    const raw = await fetchJson(u.toString(), 8000);

    for (const s of raw) {
      const id = safeStr(s.stationuuid);
      const name = safeStr(s.name);
      const streamUrl = safeStr(s.url_resolved);

      if (!id || !name || !streamUrl) continue;

      // evita mixed content em domínio https://vercel
      if (!isHttpsUrl(streamUrl)) continue;

      // se vier lastcheckok, respeita quando não for “ok”
      if (typeof s.lastcheckok === "number" && s.lastcheckok !== 1) continue;

      collected.push({
        id,
        name,
        streamUrl,
        favicon: safeStr(s.favicon) || undefined,
        country: safeStr(s.country) || undefined,
        codec: safeStr(s.codec) || undefined,
        bitrate: typeof s.bitrate === "number" ? s.bitrate : undefined,
      });
    }
  }

  return uniqById(collected).slice(0, limit);
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  const profile = normProfile(url.searchParams.get("profile"));
  const limit = clamp(Number(url.searchParams.get("limit") || "80"), 10, 120);

  const { label } = PROFILE_TAGS[profile];

  let lastErr = "Falha desconhecida";

  for (const base of MIRRORS) {
    try {
      const stations = await queryStations(base, profile, limit);
      if (!stations.length) continue;

      return NextResponse.json(
        {
          ok: true,
          profile,
          label,
          count: stations.length,
          stations,
          source: base,
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    } catch (e: any) {
      lastErr = e?.message ? String(e.message) : "Erro ao consultar mirror";
      continue;
    }
  }

  return NextResponse.json(
    {
      ok: false,
      profile,
      label,
      count: 0,
      stations: [],
      source: "mirrors",
      error: lastErr,
    },
    { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
