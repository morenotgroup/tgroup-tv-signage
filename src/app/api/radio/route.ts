import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RadioProfileId = "agency" | "focus" | "chill";

type RawStation = {
  stationuuid?: string;
  name?: string;
  url_resolved?: string;
  favicon?: string;
  country?: string;
  codec?: string;
  bitrate?: number;
  tags?: string;
  lastcheckok?: number;
};

type Station = {
  id: string;
  name: string;
  streamUrl: string;
  favicon?: string;
  country?: string;
  codec?: string;
  bitrate?: number;
};

type ApiResp = {
  ok: boolean;
  profile: RadioProfileId;
  label?: string;
  count?: number;
  stations: Station[];
  error?: string;
  source?: string;
};

const MIRRORS = [
  "https://de1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
  "https://all.api.radio-browser.info",
];

const PROFILE_TAGS: Record<RadioProfileId, { label: string; tags: string[] }> = {
  agency: {
    label: "Agência",
    tags: ["dance", "electronic", "house", "pop", "hits", "top 40"],
  },
  focus: {
    label: "Focus",
    tags: ["lofi", "study", "focus", "chillout", "ambient", "downtempo"],
  },
  chill: {
    label: "Chill",
    tags: ["chill", "lounge", "ambient", "downtempo", "relax", "chillout"],
  },
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function normProfile(p?: string | null): RadioProfileId {
  if (p === "agency" || p === "focus" || p === "chill") return p;
  return "agency";
}

function safeStr(s: unknown) {
  return typeof s === "string" ? s.trim() : "";
}

function isHttpUrl(s: string) {
  return s.startsWith("http://") || s.startsWith("https://");
}

function uniqBy<T>(arr: T[], keyFn: (t: T) => string) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    const k = keyFn(item);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

async function fetchWithTimeout(url: string, ms = 7000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);

  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Radio Browser pede User-Agent em exemplos/bibliotecas e ajuda a evitar bloqueios genéricos
        "User-Agent": "tgroup-tv-signage/0.1 (Next.js on Vercel)",
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as RawStation[];
  } finally {
    clearTimeout(t);
  }
}

function buildSearchUrl(base: string, tags: string[], limit: number) {
  // Endpoint oficial: /json/stations/search
  const endpoint = new URL("/json/stations/search", base);

  // Estratégia: usar 1 tag “principal” por chamada e depois juntar + deduplicar.
  // Aqui a gente não seta tag direto no URL final; montamos em loop fora.
  endpoint.searchParams.set("limit", String(limit));
  endpoint.searchParams.set("hidebroken", "true");
  endpoint.searchParams.set("order", "clickcount");
  endpoint.searchParams.set("reverse", "true");

  return endpoint;
}

async function getStations(profile: RadioProfileId, limit: number) {
  const { tags } = PROFILE_TAGS[profile];

  // tenta mirrors em sequência
  let lastErr = "Falha desconhecida";
  for (const base of MIRRORS) {
    try {
      const perTag = Math.max(10, Math.ceil(limit / Math.max(1, tags.length)));

      const collected: RawStation[] = [];
      for (const tag of tags) {
        const endpoint = buildSearchUrl(base, tags, perTag);
        endpoint.searchParams.set("tag", tag);

        const urlStr = endpoint.toString();
        const items = await fetchWithTimeout(urlStr, 7000);
        collected.push(...items);
      }

      const cleaned = collected
        .map((s): Station | null => {
          const id = safeStr(s.stationuuid);
          const name = safeStr(s.name);
          const streamUrl = safeStr(s.url_resolved);
          if (!id || !name || !streamUrl) return null;
          if (!isHttpUrl(streamUrl)) return null;

          // alguns registros podem estar “quebrados”, então filtramos pelo básico
          return {
            id,
            name,
            streamUrl,
            favicon: safeStr(s.favicon) || undefined,
            country: safeStr(s.country) || undefined,
            codec: safeStr(s.codec) || undefined,
            bitrate: typeof s.bitrate === "number" ? s.bitrate : undefined,
          };
        })
        .filter(Boolean) as Station[];

      const unique = uniqBy(cleaned, (x) => x.id).slice(0, limit);

      return {
        ok: true as const,
        stations: unique,
        source: base,
      };
    } catch (e: any) {
      lastErr = e?.message ? String(e.message) : "Erro ao consultar mirror";
      continue;
    }
  }

  return {
    ok: false as const,
    stations: [] as Station[],
    source: "mirrors",
    error: lastErr,
  };
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const profile = normProfile(u.searchParams.get("profile"));
  const limit = clamp(Number(u.searchParams.get("limit") || "80"), 10, 120);

  const { label } = PROFILE_TAGS[profile];

  const result = await getStations(profile, limit);

  const payload: ApiResp = {
    ok: result.ok,
    profile,
    label,
    count: result.stations.length,
    stations: result.stations,
    source: result.source,
    ...(result.ok ? {} : { error: (result as any).error ?? "Falha" }),
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
