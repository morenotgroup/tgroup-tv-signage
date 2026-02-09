import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NewsItem = {
  title: string;
  source?: string;
  url?: string;
  image?: string;
};

let CACHE: { ts: number; items: NewsItem[] } | null = null;

const DEFAULT_FEEDS = [
  // Brasil + pt-BR (alguns trazem imagem no description/enclosure, outros via OG)
  "https://rss.uol.com.br/feed/noticias.xml",
  "https://g1.globo.com/rss/g1/",
  "https://www.bbc.com/portuguese/index.xml",
];

function decodeHtml(s: string) {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(s: string) {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function safeUrl(u?: string) {
  if (!u) return undefined;
  const s = u.trim();
  if (!/^https?:\/\//i.test(s)) return undefined;
  return s;
}

function getTag(block: string, tag: string) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  return m?.[1] ? decodeHtml(m[1]).trim() : undefined;
}

function getAttr(block: string, tag: string, attr: string) {
  const re = new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["'][^>]*>`, "i");
  const m = block.match(re);
  return m?.[1] ? decodeHtml(m[1]).trim() : undefined;
}

function extractFirstImageFromHtml(html?: string) {
  if (!html) return undefined;
  const m =
    html.match(/<img[^>]+src=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+name=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  return safeUrl(m?.[1]);
}

function parseRssItems(xml: string): NewsItem[] {
  const out: NewsItem[] = [];

  // RSS <item>...
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  for (const it of items) {
    const title = stripTags(getTag(it, "title") ?? "");
    const link = safeUrl(getTag(it, "link") ?? getAttr(it, "link", "href"));
    const source = stripTags(getTag(it, "source") ?? getTag(it, "dc:creator") ?? "") || undefined;

    // imagens comuns em RSS
    const media =
      safeUrl(getAttr(it, "media:content", "url")) ||
      safeUrl(getAttr(it, "media:thumbnail", "url")) ||
      safeUrl(getAttr(it, "enclosure", "url")) ||
      extractFirstImageFromHtml(getTag(it, "description"));

    if (title) out.push({ title, url: link, source, image: media });
  }

  // Atom <entry>...
  const entries = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  for (const en of entries) {
    const title = stripTags(getTag(en, "title") ?? "");
    const link = safeUrl(getAttr(en, "link", "href")) || safeUrl(getTag(en, "link"));
    const source =
      stripTags(getTag(en, "source") ?? getTag(en, "author") ?? getTag(en, "name") ?? "") || undefined;

    const media =
      safeUrl(getAttr(en, "media:content", "url")) ||
      safeUrl(getAttr(en, "media:thumbnail", "url")) ||
      extractFirstImageFromHtml(getTag(en, "summary"));

    if (title) out.push({ title, url: link, source, image: media });
  }

  return out;
}

function domainFromUrl(url?: string) {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

async function fetchWithTimeout(url: string, timeoutMs = 5500) {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      cache: "no-store",
      headers: {
        // alguns sites bloqueiam UA vazia
        "user-agent":
          "Mozilla/5.0 (compatible; TGroupSignage/1.0; +https://vercel.app)",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    const text = await res.text();
    return { ok: res.ok, text };
  } finally {
    clearTimeout(id);
  }
}

async function enrichOgImages(items: NewsItem[], maxFetch = 6) {
  let count = 0;
  for (const it of items) {
    if (it.image) continue;
    if (!it.url) continue;
    if (count >= maxFetch) break;

    count += 1;
    try {
      const { ok, text } = await fetchWithTimeout(it.url, 4500);
      if (!ok) continue;
      const og =
        text.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
        text.match(/<meta[^>]+name=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];

      const img = safeUrl(og ? decodeHtml(og) : undefined);
      if (img) it.image = img;
    } catch {
      // ignora
    }
  }
}

function dedupe(items: NewsItem[]) {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const it of items) {
    const key = (it.title ?? "").toLowerCase().slice(0, 140);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

export async function GET() {
  // cache 3 min
  const now = Date.now();
  if (CACHE && now - CACHE.ts < 3 * 60_000 && CACHE.items.length) {
    return NextResponse.json({ ok: true, items: CACHE.items });
  }

  const feedsEnv = process.env.NEWS_RSS_FEEDS;
  const feeds = (feedsEnv ? feedsEnv.split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_FEEDS).slice(0, 6);

  const all: NewsItem[] = [];
  for (const f of feeds) {
    try {
      const { ok, text } = await fetchWithTimeout(f, 6500);
      if (!ok) continue;
      const parsed = parseRssItems(text);
      all.push(...parsed.slice(0, 10));
    } catch {
      // ignora feed ruim
    }
  }

  // normaliza source
  const normalized = all.map((it) => ({
    ...it,
    source: it.source ?? domainFromUrl(it.url),
  }));

  // tira lixo e dup
  let items = dedupe(normalized)
    .filter((x) => x.title && x.title.length > 12)
    .slice(0, 18);

  // OG image leve
  await enrichOgImages(items, 6);

  // se ainda veio vazio, fallback (pra não ficar “carregando” eternamente)
  if (!items.length) {
    items = [
      { title: "T.Group • News • Sem carregamento agora (feeds instáveis).", source: "T.Group" },
      { title: "Sugestão: revisar feeds RSS no env NEWS_RSS_FEEDS.", source: "T.Group" },
    ];
  }

  CACHE = { ts: now, items };

  return NextResponse.json({ ok: true, items });
}
