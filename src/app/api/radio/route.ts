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

  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "tgroup-tv-signage/0.1 (Next.js on Vercel)",
      },
      cache: "no-store",
    });

    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: "RADIO_BROWSER_FETCH_FAILED", status: r.status },
        { status: 502 }
      );
    }

    const data = (await r.json()) as RadioBrowserStation[];

    // Importante: evitar Mixed Content (HTTPS page carregando stream HTTP pode ser bloqueado)
    const filtered = (Array.isArray(data) ? data : [])
      .filter((s) => s && s.stationuuid && s.name)
      .filter((s) => s.lastcheckok === 1 || typeof s.lastcheckok === "undefined")
      .filter(
        (s) =>
          typeof s.url_resolved === "string" && s.url_resolved.startsWith("https://")
      );

    const stations = uniqBy(filtered, (s) => s.stationuuid)
      .slice(0, 60)
      .map((s) => ({
        stationuuid: s.stationuuid,
        name: s.name,
        url_resolved: s.url_resolved,
        favicon: s.favicon || "",
        tags: s.tags || "",
        countrycode: s.countrycode || "",
        codec: s.codec || "",
        bitrate: s.bitrate ?? 0,
      }));

    return NextResponse.json(
      { ok: true, base, tag, countrycode, stations },
      { headers: { "Cache-Control": "public, max-age=60" } }
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "RADIO_BROWSER_FETCH_FAILED", status: 502 },
      { status: 502 }
    );
  }
}
