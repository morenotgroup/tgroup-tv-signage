// src/app/api/news/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
// Cache no lado do Next para reduzir chamadas e não estourar quota.
// (Mesmo assim: se estiver no plano Developer, uso em produção "incluindo interno" não é permitido.)
export const revalidate = 600; // 10 min

type NewsItem = {
  title: string;
  source?: string;
  url?: string;
  image?: string;
};

type NewsApiArticle = {
  source?: { id?: string | null; name?: string };
  author?: string | null;
  title?: string;
  description?: string | null;
  url?: string;
  urlToImage?: string | null;
  publishedAt?: string;
  content?: string | null;
};

type NewsApiResponse = {
  status?: "ok" | "error";
  totalResults?: number;
  articles?: NewsApiArticle[];
  code?: string;
  message?: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeStr(v: any) {
  return typeof v === "string" ? v : "";
}

function normalizeTitle(t: string) {
  return t.replace(/\s+/g, " ").trim();
}

export async function GET(req: Request) {
  try {
    const apiKey = process.env.NEWSAPI_KEY || process.env.NEWS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          provider: "newsapi",
          error: "missing_api_key",
          hint: "Defina NEWSAPI_KEY (ou NEWS_API_KEY) nas env vars do Vercel / .env.local",
          items: [] as NewsItem[],
        },
        { status: 200 }
      );
    }

    const url = new URL(req.url);

    // parâmetros opcionais via querystring:
    // /api/news?country=br&language=pt&q=...
    const country = safeStr(url.searchParams.get("country") ?? process.env.NEWS_COUNTRY ?? "br");
    const language = safeStr(url.searchParams.get("language") ?? process.env.NEWS_LANGUAGE ?? "pt");
    const q = safeStr(url.searchParams.get("q") ?? process.env.NEWS_QUERY ?? "");
    const category = safeStr(url.searchParams.get("category") ?? process.env.NEWS_CATEGORY ?? "");
    const pageSize = clamp(Number(url.searchParams.get("pageSize") ?? process.env.NEWS_PAGE_SIZE ?? 12), 1, 20);

    const endpoint = new URL("https://newsapi.org/v2/top-headlines");
    endpoint.searchParams.set("pageSize", String(pageSize));
    endpoint.searchParams.set("apiKey", apiKey);

    // O NewsAPI aceita country/language/q/category no top-headlines. :contentReference[oaicite:3]{index=3}
    if (country) endpoint.searchParams.set("country", country);
    if (language) endpoint.searchParams.set("language", language);
    if (q) endpoint.searchParams.set("q", q);
    if (category) endpoint.searchParams.set("category", category);

    const res = await fetch(endpoint.toString(), {
      // Mesmo com `revalidate`, manter isso simples e estável
      // (evita bater no NewsAPI a cada render da TV)
      next: { revalidate },
      headers: {
        "User-Agent": "tgroup-tv-signage/1.0",
        "Accept": "application/json",
      },
    });

    const json = (await res.json()) as NewsApiResponse;

    if (!res.ok || json.status !== "ok") {
      return NextResponse.json(
        {
          ok: false,
          provider: "newsapi",
          error: json.code ?? "newsapi_error",
          message: json.message ?? `HTTP ${res.status}`,
          items: [] as NewsItem[],
        },
        { status: 200 }
      );
    }

    const items: NewsItem[] = (json.articles ?? [])
      .map((a) => {
        const title = normalizeTitle(safeStr(a.title));
        if (!title) return null;

        return {
          title,
          source: a.source?.name,
          url: a.url,
          // aqui vem a diferença: imagem real no card (urlToImage) :contentReference[oaicite:4]{index=4}
          image: a.urlToImage ?? undefined,
        } as NewsItem;
      })
      .filter(Boolean) as NewsItem[];

    return NextResponse.json(
      {
        ok: true,
        provider: "newsapi",
        items,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        provider: "newsapi",
        error: "unexpected_error",
        message: e?.message ?? "unknown",
        items: [] as NewsItem[],
      },
      { status: 200 }
    );
  }
}
