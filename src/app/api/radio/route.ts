import { NextResponse } from "next/server";
import { RADIO_PROFILES, type RadioProfileId } from "@/lib/radioProfiles";

type RBStation = {
  stationuuid: string;
  name: string;
  url_resolved: string;
  favicon: string;
  homepage: string;
  tags: string;
  country: string;
  countrycode: string;
  codec: string;
  bitrate: number;
  lastcheckok: number;
  lastchecktime: string;
};

type OutStation = {
  id: string;
  name: string;
  streamUrl: string;
  favicon?: string;
  homepage?: string;
  tags?: string;
  country?: string;
  codec?: string;
  bitrate?: number;
};

const MIRRORS = [
  // Radio Browser tem vários mirrors. Se um falhar, tentamos o próximo.
  "https://de1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
];

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), ms);

  // @ts-expect-error - we pass the signal via fetch below, not here
  promise.signal = ctrl.signal;

  return Promise.race([
    promise.finally(() => clearTimeout(timeout)),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms)
    ),
  ]);
}

async function fetchJson(url: string, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "tgroup-tv-signage/1.0 (+Vercel)",
      },
      // Edge/runtime caching depende do Next/Vercel — aqui deixo “no-store”
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as RBStation[];
  } finally {
    clearTimeout(t);
  }
}

function buildSearchUrl(base: string, params: Record<string, string>) {
  const u = new URL("/json/stations/search", base);
  for (const [k, v] of Object.entries(params)) {
    if (v !== "") u.searchParams.set(k, v);
  }
  return u.toString();
}

function uniqById(stations: OutStation[]) {
  const seen = new Set<string>();
  const out: OutStation[] = [];
  for (const s of stations) {
    if (!s?.id) continue;
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const profile = (searchParams.get("profile") ?? "agency") as RadioProfileId;
  const chosen = RADIO_PROFILES[profile] ?? RADIO_PROFILES.agency;

  // Overrides opcionais (se você quiser brincar via URL)
  const tagOverride = searchParams.get("tag")?.trim() || "";
  const countryOverride = searchParams.get("countrycode")?.trim() || "";
  const limit = Math.max(10, Math.min(120, Number(searchParams.get("limit") || 80)));

  const tagsToTry = tagOverride ? [tagOverride] : chosen.tags;
  const countriesToTry = countryOverride
    ? [countryOverride]
    : chosen.countryPriority;

  // Plano de tentativa: (country x tag x codec)
  const attempts: Array<Record<string, string>> = [];
  for (const countrycode of countriesToTry) {
    for (const tag of tagsToTry) {
      for (const codec of chosen.codecs) {
        attempts.push({
          tag,
          countrycode,
          codec,
          bitrateMin: String(chosen.bitrateMin),
          hidebroken: "true",
          is_https: "true",
          order: "votes",
          reverse: "true",
          limit: String(chosen.perTryLimit),
        });
      }
    }
  }

  const collected: OutStation[] = [];
  const errors: string[] = [];

  // Tentamos mirrors + attempts até coletar o suficiente
  outer: for (const mirror of MIRRORS) {
    for (const params of attempts) {
      try {
        const url = buildSearchUrl(mirror, params);
        const data = await fetchJson(url, 9000);

        const mapped: OutStation[] = (data || [])
          // só por segurança extra:
          .filter((s) => !!s.url_resolved && s.lastcheckok === 1)
          .map((s) => ({
            id: s.stationuuid,
            name: s.name,
            streamUrl: s.url_resolved,
            favicon: s.favicon || undefined,
            homepage: s.homepage || undefined,
            tags: s.tags || undefined,
            country: s.country || s.countrycode || undefined,
            codec: s.codec || undefined,
            bitrate: typeof s.bitrate === "number" ? s.bitrate : undefined,
          }));

        collected.push(...mapped);

        const deduped = uniqById(collected);
        if (deduped.length >= limit) break outer;
      } catch (e: any) {
        errors.push(`${mirror} :: ${params.tag}/${params.countrycode}/${params.codec} => ${e?.message || "error"}`);
      }
    }
  }

  const result = uniqById(collected).slice(0, limit);

  return NextResponse.json(
    {
      profile: chosen.id,
      label: chosen.label,
      count: result.length,
      stations: result,
      // Só pra debug se um dia precisar (pode remover depois)
      debug: {
        tagOverride: tagOverride || null,
        countryOverride: countryOverride || null,
        errors: errors.slice(0, 8),
      },
    },
    {
      headers: {
        // Ajuda a não martelar a API toda hora
        "Cache-Control": "s-maxage=900, stale-while-revalidate=3600",
      },
    }
  );
}
