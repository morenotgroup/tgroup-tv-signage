"use client";

import { useEffect, useState } from "react";

type Article = { title: string; url: string; source?: string };
type News = { articles: Article[] };

export default function NewsScene() {
  const [data, setData] = useState<News | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      const r = await fetch("/api/news", { cache: "no-store" });
      if (!r.ok) return;
      const json = (await r.json()) as News;
      if (alive) setData(json);
    }

    load();
    const t = setInterval(load, 30 * 60 * 1000); // 30 min
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <section className="h-full w-full p-14 flex flex-col">
      <div className="flex items-baseline justify-between">
        <div className="text-5xl font-semibold">Notícias</div>
        <div className="text-lg opacity-60">Manchetes em rotação</div>
      </div>

      <div className="mt-10 space-y-5">
        {(data?.articles ?? []).slice(0, 8).map((a) => (
          <div
            key={a.url}
            className="rounded-3xl border border-white/10 bg-white/5 p-7"
          >
            <div className="text-2xl font-semibold leading-snug">{a.title}</div>
            <div className="mt-2 text-sm opacity-60 truncate">{a.url}</div>
          </div>
        ))}
        {!data && (
          <div className="text-xl opacity-70">Carregando manchetes…</div>
        )}
      </div>

      <div className="mt-auto text-sm opacity-60">
        Fonte: GDELT (open data) :contentReference[oaicite:9]{index=9}
      </div>
    </section>
  );
}
