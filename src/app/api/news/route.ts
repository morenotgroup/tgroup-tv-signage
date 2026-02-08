import { NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";
import { SIGNAGE_CONFIG } from "@/config";

export const runtime = "nodejs";

type RssItem = {
  title?: string;
  link?: string;
  pubDate?: string;
  source?: { "#text"?: string };
};

export async function GET() {
  const rssUrl =
    process.env.NEWS_RSS_URL ||
    // @ts-expect-error - caso o config seja editado e perca a key, ainda funciona
    SIGNAGE_CONFIG.newsRssUrl ||
    "https://news.google.com/rss?hl=pt-BR&gl=BR&ceid=BR:pt-419";

  try {
    const res = await fetch(rssUrl, { next: { revalidate: 600 } });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `News RSS fetch failed (${res.status})` },
        { status: 502 }
      );
    }

    const xml = await res.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      trimValues: true,
    });

    const parsed = parser.parse(xml);

    const items: RssItem[] =
      parsed?.rss?.channel?.item
        ? Array.isArray(parsed.rss.channel.item)
          ? parsed.rss.channel.item
          : [parsed.rss.channel.item]
        : [];

    const normalized = items
      .slice(0, 12)
      .map((it) => ({
        title: (it.title ?? "").replace(/\s+/g, " ").trim(),
        link: it.link ?? "",
        pubDate: it.pubDate ?? "",
        source: it.source?.["#text"] ?? "",
      }))
      .filter((x) => x.title);

    return NextResponse.json(
      { ok: true, items: normalized, source: "google_news_rss" },
      { headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=1200" } }
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "News RSS fetch failed (network error)" },
      { status: 502 }
    );
  }
}
