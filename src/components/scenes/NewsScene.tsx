"use client";

type NewsItem = {
  title: string;
  url?: string;
  source?: string;
  publishedAt?: string;
};

function formatDateBR(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function NewsScene({ items }: { items: NewsItem[] }) {
  const safeItems = Array.isArray(items) ? items : [];

  return (
    <section className="h-full w-full flex flex-col p-10">
      <div className="flex items-end justify-between gap-6">
        <div>
          <div className="text-sm opacity-60">Atualiza automaticamente</div>
          <h2 className="text-5xl font-semibold tracking-tight">Notícias</h2>
        </div>

        <div className="text-sm opacity-60 text-right">
          <div>Brasil + Mundo</div>
          <div className="opacity-80">Fonte: GDELT (open data)</div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-6">
        {safeItems.slice(0, 10).map((n, i) => (
          <article
            key={`${n.title}-${i}`}
            className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="text-xs opacity-60 truncate">
                {n.source ?? "Fonte"}
              </div>
              <div className="text-xs opacity-50 whitespace-nowrap">
                {formatDateBR(n.publishedAt)}
              </div>
            </div>

            <div className="mt-3 text-2xl font-medium leading-snug">
              {n.title}
            </div>

            {n.url ? (
              <div className="mt-4 text-xs opacity-60 break-all">
                {n.url}
              </div>
            ) : null}
          </article>
        ))}
      </div>

      <div className="mt-auto pt-6 text-sm opacity-60">
        Dica: se você colar código aqui do chat, cole apenas o que estiver dentro do bloco ``` ``` pra evitar “lixo” de citação.
      </div>
    </section>
  );
}
