import { NextResponse } from "next/server";
import dns from "node:dns/promises";

export const runtime = "nodejs";

type RadioBrowserStation = {
  stationuuid: string;
  name: string;
  url: string;
  url_resolved: string;
  favicon?: string;
  tags?: string;
  countrycode?: string;
  codec?: string;
  bitrate?: number;
  lastcheckok?: number;
};

const FALLBACK_BASES = [
  "https://de1.api.radio-browser.info",
  "https://de2.api.radio-browser.info",
  "https://fi1.api.radio-browser.info",
];

async function pickRadioBrowserBase(): Promise<string> {
  try {
    const ips = await dns.resolve4("all.api.radio-browser.info");
    const hosts: string[] = [];

    for (const ip of ips.slice(0, 6)) {
      try {
        const rev = await dns.reverse(ip);
        for (const h of rev) hosts.push(h);
      } catch {
        // ignore
      }
    }

    const cleanHosts = hosts
      .map((h) => h.trim())
      .filter(Boolean)
      .map((h) => (h.startsWith("https://") ? h : `https://${h}`));

    const candidates = cleanHosts.length ? cleanHosts : FALLBACK_BASES;
    return candidates[Math.floor(Math.random() * candidates.length)];
  } catch {
    return FALLBACK_BASES[Math.floor(Math.random() * FALLBACK_BASES.length)];
  }
}

function uniqBy<T>(arr: T[], keyFn: (v: T) => string) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const v of arr) {
    const k = keyFn(v);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const tag = (searchParams.get("tag") || "lofi").trim();
  const countrycode = (searchParams.get("countrycode") || "BR")
    .trim()
    .toUpperCase();
  const limit = Math.min(Number(searchParams.get("limit") || "80"), 150);

  const base = await pickRadioBrowserBase();

  const url =
    `${base}/json/stations/search?` +
    new URLSearchParams({
      hidebroken: "true",
      order: "votes",
      reverse: "true",
      limit: String(limit),
      countrycode,
      tag,
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
