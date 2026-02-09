import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NewsItem = {
  title: string;
  source?: string;
  url?: string;
  image?: string;
};

const CACHE_MS = 5 * 60 * 1000;
let CACHE: { ts: number; items: NewsItem[] } | null = null;

const FEEDS: Array<{ name: string; url: string }> = [
  { name: "G1", url: "https://g1.globo.com/rss/g1/" },
  { name: "UOL", url: "https://rss.uol.com.br/feed/noticias.xml" },
  { name: "BBC", url: "https://feeds.bbci.co.uk/portuguese/rss.xml" },
  // Se quiser adicionar mais depois, só coloca aqui.
];

function decodeHtmlEntities(s: string) {
  // decode básico (suficiente para títulos RSS)
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function stripCdata(s: string) {
  const m = s.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i);
  return m ? m[1] : s;
}

function cleanText(s?: string) {
  if (!s) return "";
  try {
    return decodeHtmlEntities(stripCdata(s).trim()).normalize("NFC").replace(/\uFFFD/g, "");
  } catch {
    return decodeHtmlEntities(stripCdata(s).trim()).replace(/\uFFFD/g, "");
  }
}

function extractTag(block: string, tag: string) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  return m?.[1];
}

function extractAttr(block: string, tag: string, attr: string) {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]+)"[^>]*>`, "i");
  const m = block.match(re);
  return m?.[1];
}

function extractFirstImage(block: string) {
  // 1) media:content url
  const m1 = block.match(/<media:content[^>]*url="([^"]+)"/i);
  if (m1?.[1]) return m1[1];

  // 2) media:thumbnail url
  const m2 = block.match(/<media:thumbnail[^>]*url="([^"]+)"/i);
  if (m2?.[1]) return m2[1];

  // 3) enclosure url
  const m3 = block.match(/<enclosure[^>]*url="([^"]+)"/i);
  if (m3?.[1]) return m3[1];

  // 4) img dentro do description/content
  const desc = extractTag(block, "description") ?? extractTag(block, "content:encoded") ?? "";
  const m4 = desc.match(/<img[^>]*src="([^"]+)"/i);
  if (m4?.[1]) return m4[1];

  return undefined;
}

function parseRss(xml: string, sourceName: string): NewsItem[] {
  // RSS
  const items: NewsItem[] = [];
  const parts = xml.split(/<item[\s>]/i).slice(1);

  for (const p of parts) {
    const block = p.split(/<\/item>/i)[0] ?? "";

    const rawTitle = extractTag(block, "title") ?? "";
    const title = cleanText(rawTitle);
    if (!title) continue;

    // link pode vir como <link> ou <link href="">
    const link = cleanText(extractTag(block, "link") ?? extractAttr(block, "link", "href") ?? "");
    const image = extractFirstImage(block);

    // alguns feeds têm source no channel, mas aqui passamos o nome do feed
    items.push({
      title,
      url: link || undefined,
      source: sourceName,
      image,
    });
  }

  // ATOM (caso algum feed venha assim)
  if (items.length === 0) {
    const entries = xml.split(/<entry[\s>]/i).slice(1);
    for (const e of entries) {
      const block = e.split(/<\/entry>/i)[0] ?? "";
      const rawTitle = extractTag(block, "title") ?? "";
      const title = cleanText(rawTitle);
      if (!title) continue;

      const href = extractAttr(block, "link", "href");
      const link = cleanText(href ?? "");
      const image = extractFirstImage(block);

      items.push({
        title,
        url: link || undefined,
        source: sourceName,
        image,
      });
    }
  }

  return items;
}

async function fetchWithTimeout(url: string, ms: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);

  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        // ajuda alguns RSS que bloqueiam user-agent “vazio”
        "user-agent": "tgroup-tv-signage/1.0",
        accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.7",
      },
    });

    const buf = Buffer.from(await res.arrayBuffer());
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();

    // tenta pegar charset (resolve o bug de acento na maioria dos casos)
    let encoding: BufferEncoding = "utf8";
    const m = ct.match(/charset=([^;]+)/i);
    const charset = (m?.[1] ?? "").trim();

    if (charset.includes("iso-8859-1") || charset.includes("latin1") || charset.includes("windows-1252")) {
      encoding = "latin1";
    }

    // fallback: se o XML declarar encoding
    if (encoding === "utf8") {
      const head = buf.slice(0, 200).toString("utf8");
      const mx = head.match(/encoding="([^"]+)"/i);
      const decl = (mx?.[1] ?? "").toLowerCase();
      if (decl.includes("iso-8859-1") || decl.includes("latin1") || decl.includes("windows-1252")) encoding = "latin1";
    }

    const text = buf.toString(encoding);
    return { ok: res.ok, status: res.status, text };
  } finally {
    clearTimeout(id);
  }
}

export async function GET() {
  // cache simples (serverless-friendly)
  if (CACHE && Date.now() - CACHE.ts < CACHE_MS) {
    return NextResponse.json(
      { ok: true, items: CACHE.items },
      { headers: { "cache-control": "no-store" } }
    );
  }

  const all: NewsItem[] = [];

  await Promise.all(
    FEEDS.map(async (f) => {
      try {
        const r = await fetchWithTimeout(f.url, 6000);
        if (!r.ok || !r.text) return;
        const items = parseRss(r.text, f.name);
        all.push(...items);
      } catch {
        // ignora feed que falhar; não derruba o endpoint
      }
    })
  );

  // remove duplicados por título (e mantém os primeiros)
  const seen = new Set<string>();
  const deduped = all.filter((it) => {
    const key = (it.title ?? "").toLowerCase().trim();
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const items = deduped.slice(0, 20);
  CACHE = { ts: Date.now(), items };

  return NextResponse.json({ ok: true, items }, { headers: { "cache-control": "no-store" } });
}
