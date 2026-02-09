import { NextResponse } from "next/server";

export const runtime = "nodejs";

type NewsItem = {
  title: string;
  source?: string;
  url?: string;
  image?: string;
};

type Feed = {
  name: string;
  url: string;
};

const FEEDS: Feed[] = [
  // Fontes BR com imagem frequentemente disponível (RSS/enclosure/media)
  { name: "G1", url: "https://g1.globo.com/rss/g1/" },
  { name: "UOL", url: "https://rss.uol.com.br/feed/noticias.xml" },
  { name: "BBC", url: "https://feeds.bbci.co.uk/portuguese/rss.xml" },
];

const CACHE_MS = 4 * 60_000; // 4 min
let CACHE: { ts: number; items: NewsItem[] } | null = null;

function decodeHtmlEntities(input: string) {
  const s = input ?? "";
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function fixMojibakeServer(input: string) {
  const s = input ?? "";
  if (!/[ÃÂ]/.test(s)) return s;
  try {
    return Buffer.from(s, "latin1").toString("utf8");
  } catch {
    return s;
  }
}

function normalizeText(input?: string) {
  if (!input) return "";
  let s = input;
  s = decodeHtmlEntities(s);
  s = fixMojibakeServer(s);
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function extractTag(block: string, tag: string) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  return m?.[1]?.trim();
}

function extractCdata(v?: string) {
  if (!v) return "";
  const m = v.match(/<!\[CDATA\[([\s\S]*?)\]\]>/i);
  return (m?.[1] ?? v).trim();
}

function firstImageFromItem(itemXml: string) {
  // media:content
  let m = itemXml.match(/<media:content[^>]*url="([^"]+)"[^>]*>/i);
  if (m?.[1]) return m[1];

  // media:thumbnail
  m = itemXml.match(/<media:thumbnail[^>]*url="([^"]+)"[^>]*>/i);
  if (m?.[1]) return m[1];

  // enclosure
  m = itemXml.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image\/[^"]+"[^>]*>/i);
  if (m?.[1]) return m[1];

  // img dentro de description/content
  const desc = extractCdata(extractTag(itemXml, "description"));
  const img = desc.match(/<img[^>]*src="([^"]+)"[^>]*>/i);
  if (img?.[1]) return img[1];

  return undefined;
}

async function fetchText(url: string, timeoutMs = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "user-agent": "tgroup-tv-signage/1.0",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      cache: "no-store",
    });

    const ab = await res.arrayBuffer();
    const text = Buffer.from(ab).toString("utf8");
    return text;
  } finally {
    clearTimeout(t);
  }
}

async function ogImageFromUrl(url?: string) {
  if (!url) return undefined;
  try {
    const html = await fetchText(url, 5500);
    const m =
      html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (m?.[1]) return m[1];
    return undefined;
  } catch {
    return undefined;
  }
}

function parseRss(xml: string, sourceName: string): NewsItem[] {
  const items: NewsItem[] = [];
  const chunks = xml.split(/<\/item>/i);
  for (const chunk of chunks) {
    if (!/<item/i.test(chunk)) continue;
    const itemXml = chunk + "</item>";

    const rawTitle = extractCdata(extractTag(itemXml, "title") || "");
    const rawLink = extractCdata(extractTag(itemXml, "link") || "");
    const title = normalizeText(rawTitle);
    if (!title) continue;

    const url = rawLink ? normalizeText(rawLink) : undefined;
    const image = firstImageFromItem(itemXml);

    items.push({
      title,
      url,
      source: sourceName,
      image,
    });
  }
  return items;
}

function uniqByTitle(items: NewsItem[]) {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const it of items) {
    const key = (it.title || "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

async function loadNews(): Promise<NewsItem[]> {
  const all: NewsItem[] = [];

  // carrega feeds em paralelo
  const results = await Promise.allSettled(
    FEEDS.map(async (f) => {
      const xml = await fetchText(f.url, 6500);
      return parseRss(xml, f.name);
    })
  );

  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
  }

  let items = uniqByTitle(all).slice(0, 16);

  // Scraping leve: só tenta OG image pros primeiros que não tiverem imagem
  const need = items.filter((x) => !x.image && x.url).slice(0, 5);

  await Promise.allSettled(
    need.map(async (n) => {
      const og = await ogImageFromUrl(n.url);
      if (og) n.image = og;
    })
  );

  // se ainda não tiver imagem, cai pro favicon do domínio (melhor que ícone repetido)
  items = items.map((it) => {
    if (it.image) return it;
    try {
      const domain = it.url ? new URL(it.url).hostname.replace(/^www\./, "") : "";
      if (!domain) return it;
      return {
        ...it,
        image: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`,
      };
    } catch {
      return it;
    }
  });

  return items.slice(0, 12);
}

export async function GET() {
  try {
    const now = Date.now();
    if (CACHE && now - CACHE.ts < CACHE_MS && CACHE.items?.length) {
      return NextResponse.json(
        { ok: true, items: CACHE.items },
        {
          headers: {
            "Cache-Control": "public, s-maxage=240, stale-while-revalidate=600",
          },
        }
      );
    }

    const items = await loadNews();
    CACHE = { ts: now, items };

    return NextResponse.json(
      { ok: true, items },
      {
        headers: {
          "Cache-Control": "public, s-maxage=240, stale-while-revalidate=600",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { ok: false, items: [] },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}