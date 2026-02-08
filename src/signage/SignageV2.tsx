"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { SIGNAGE_CONFIG } from "@/config";
import { MusicDock } from "@/components/MusicDock";
import { postersForMonth, postersForToday } from "@/content/birthdays";

type WeatherData = {
  tempC?: number;
  desc?: string;
  icon?: string;
};

type NewsItem = {
  title: string;
  source?: string;
  link?: string;
  image?: string;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatTimePtBR(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatDatePtBR(d: Date) {
  // domingo, 08 de fevereiro de 2026
  return d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function useQueryFlag(key: string) {
  const [val, setVal] = useState<string | null>(null);
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      setVal(u.searchParams.get(key));
    } catch {
      setVal(null);
    }
  }, [key]);
  return val;
}

function AgencyBackdrop() {
  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 bg-black" />
      <div className="absolute inset-0 opacity-70 bg-[radial-gradient(circle_at_20%_30%,rgba(59,130,246,0.55),transparent_55%),radial-gradient(circle_at_70%_20%,rgba(16,185,129,0.45),transparent_52%),radial-gradient(circle_at_80%_80%,rgba(239,68,68,0.48),transparent_55%)]" />
      <div className="absolute inset-0 opacity-[0.18] bg-[linear-gradient(to_bottom,rgba(255,255,255,0.08),transparent_35%,transparent_65%,rgba(255,255,255,0.06))]" />
      <div className="absolute inset-0 opacity-[0.08] bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.15),transparent_55%)]" />
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs uppercase tracking-widest text-white/75">
      {children}
    </span>
  );
}

function Logo({ src, label }: { src: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={label}
        className="h-8 w-8 rounded-xl bg-white/10 border border-white/10 object-contain"
        onError={(e) => {
          // fallback: some TVs fail to load SVG; keep UI alive
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
      <div className="leading-tight">
        <div className="text-sm font-semibold">{SIGNAGE_CONFIG.companyName}</div>
        <div className="text-xs text-white/60">TV Signage • {SIGNAGE_CONFIG.locationLabel}</div>
      </div>
    </div>
  );
}

async function tryWakeLock() {
  // não quebra em TV que não suporta
  // @ts-ignore
  const wl = (navigator as any)?.wakeLock;
  if (!wl?.request) return;
  try {
    await wl.request("screen");
  } catch {
    // ignore
  }
}

export default function SignageV2() {
  const tv = useQueryFlag("tv") === "1";
  const [now, setNow] = useState(() => new Date());
  const [scene, setScene] = useState(0);

  const [lastSync, setLastSync] = useState<Date | null>(null);

  const [weather, setWeather] = useState<WeatherData>({});
  const [news, setNews] = useState<NewsItem[]>([]);

  const birthdayToday = useMemo(() => postersForToday(now), [now]);
  const birthdayMonth = useMemo(() => postersForMonth(now), [now]);

  const sceneCount = 4;

  // clock tick
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // scene rotation
  useEffect(() => {
    const t = setInterval(() => {
      setScene((s) => (s + 1) % sceneCount);
    }, SIGNAGE_CONFIG.sceneDurationMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // wake lock for TV mode
  useEffect(() => {
    if (!tv) return;
    tryWakeLock();
  }, [tv]);

  // fetch weather/news (se já existe API no repo, ótimo; se não existir, fica suave sem texto beta)
  async function refreshAll() {
    try {
      const w = await fetch("/api/weather", { cache: "no-store" });
      if (w.ok) {
        const j = await w.json();
        setWeather({
          tempC: typeof j?.tempC === "number" ? j.tempC : undefined,
          desc: typeof j?.desc === "string" ? j.desc : undefined,
          icon: typeof j?.icon === "string" ? j.icon : undefined,
        });
      }
    } catch {
      // ignore
    }

    try {
      const n = await fetch("/api/news", { cache: "no-store" });
      if (n.ok) {
        const j = await n.json();
        const items = Array.isArray(j?.items) ? j.items : Array.isArray(j) ? j : [];
        setNews(
          items
            .map((x: any) => ({
              title: String(x?.title || "").trim(),
              source: x?.source ? String(x.source) : undefined,
              link: x?.link ? String(x.link) : undefined,
              image: x?.image ? String(x.image) : undefined,
            }))
            .filter((x: NewsItem) => x.title)
            .slice(0, 12)
        );
      }
    } catch {
      // ignore
    }

    setLastSync(new Date());
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const tw = setInterval(refreshAll, SIGNAGE_CONFIG.refreshWeatherMs);
    return () => clearInterval(tw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // fullscreen (TV: costuma precisar de gesto)
  async function enterFullscreen() {
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen();
    } catch {
      // ignore
    }
  }

  // ticker text (sem “texto beta”)
  const tickerText = useMemo(() => {
    const parts: string[] = [];

    if (birthdayToday.length) {
      parts.push(`🎂 Hoje: ${birthdayToday.map((b) => b.name).join(", ")}`);
    } else if (birthdayMonth.length) {
      parts.push(`🎂 Aniversariantes do mês no ar`);
    } else {
      parts.push(`✨ T.Group • ${SIGNAGE_CONFIG.locationLabel}`);
    }

    if (news.length) {
      parts.push(`🗞️ ${news[0]?.title}`);
    }

    return parts.join("   •   ");
  }, [birthdayToday.length, birthdayMonth.length, news]);

  const newsHero = news[scene % Math.max(1, news.length)];

  return (
    <div className="relative min-h-screen w-full bg-black text-white overflow-hidden">
      <AgencyBackdrop />

      <div className="relative z-10">
        <div className="stage px-8 pt-6 pb-4">
          {/* TOP BAR */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <Logo src={SIGNAGE_CONFIG.groupLogoSrc} label="T.Group" />

              <div className="hidden md:flex items-center gap-2">
                {SIGNAGE_CONFIG.brandTabs.map((b) => (
                  <span
                    key={b.id}
                    className="rounded-full border border-white/12 bg-white/5 px-3 py-1 text-xs tracking-widest text-white/70"
                  >
                    {b.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="text-right">
              <div className="text-[64px] leading-none font-semibold tracking-tight">
                {formatTimePtBR(now)}
              </div>
              <div className="text-white/70 text-sm">{formatDatePtBR(now)}</div>

              {tv ? (
                <div className="mt-3 flex items-center justify-end gap-2">
                  <Pill>TV</Pill>
                  <Pill>Sync {lastSync ? formatTimePtBR(lastSync) : "—"}</Pill>
                  <button
                    className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs hover:bg-white/15 transition"
                    onClick={enterFullscreen}
                    type="button"
                  >
                    Tela cheia
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {/* MAIN CARD */}
          <div className="mt-6 rounded-[28px] border border-white/10 bg-black/35 backdrop-blur-2xl shadow-[0_22px_70px_rgba(0,0,0,0.55)] overflow-hidden">
            <div className="p-8 min-h-[520px]">
              {/* SCENE 0: HERO / BOAS VINDAS */}
              {scene === 0 ? (
                <div className="h-full flex flex-col justify-start">
                  <div className="flex items-center gap-3">
                    <Pill>Recepção</Pill>
                    <Pill>Premium</Pill>
                  </div>

                  <h1 className="mt-5 text-[64px] leading-[1.02] font-semibold tracking-tight">
                    Bem-vindos <span className="opacity-80">👋</span>
                  </h1>

                  <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                      <div className="text-xs opacity-60 tracking-widest">AGORA</div>
                      <div className="mt-2 text-4xl font-semibold">{formatTimePtBR(now)}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                      <div className="text-xs opacity-60 tracking-widest">LOCAL</div>
                      <div className="mt-2 text-4xl font-semibold">SP</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                      <div className="text-xs opacity-60 tracking-widest">STATUS</div>
                      <div className="mt-2 text-4xl font-semibold">ON</div>
                    </div>
                  </div>

                  <div className="mt-6 text-sm text-white/70 max-w-[880px]">
                    Uma tela viva pra recepção: clima, aniversariantes e manchetes — com visual de monitor premium.
                  </div>

                  {tv ? (
                    <div className="mt-4 text-xs text-white/60">
                      Dica: deixe aberto com <span className="font-semibold">?tv=1</span>. O som pode exigir 1 clique em “Ativar som”.
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* SCENE 1: ANIVERSARIANTES (POSTER VISUAL) */}
              {scene === 1 ? (
                <div className="h-full">
                  <div className="flex items-center gap-3">
                    <Pill>Aniversariantes</Pill>
                    <Pill>{birthdayToday.length ? "Hoje" : "Mês"}</Pill>
                  </div>

                  <div className="mt-6">
                    {birthdayToday.length ? (
                      <PosterWall posterSrc={birthdayToday[0].posterSrc} />
                    ) : birthdayMonth.length ? (
                      <PosterWall posterSrc={birthdayMonth[(now.getDate() - 1) % birthdayMonth.length].posterSrc} />
                    ) : (
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-white/75">
                        Nenhum poster cadastrado ainda.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {/* SCENE 2: CLIMA (VISUAL) */}
              {scene === 2 ? (
                <div className="h-full">
                  <div className="flex items-center gap-3">
                    <Pill>Clima</Pill>
                    <Pill>Agora</Pill>
                  </div>

                  <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                    <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
                      <div className="text-xs opacity-60 tracking-widest">TEMPERATURA</div>
                      <div className="mt-4 text-[84px] leading-none font-semibold">
                        {typeof weather.tempC === "number" ? `${Math.round(weather.tempC)}°` : "—"}
                      </div>
                      <div className="mt-3 text-white/70 text-lg">
                        {weather.desc || "Atualizando..."}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-white/5 p-8 h-[260px] flex items-center justify-center">
                      <div className="text-[120px] opacity-80">
                        {weather.icon || "☁️"}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* SCENE 3: NEWS (MANCHETE VISUAL) */}
              {scene === 3 ? (
                <div className="h-full">
                  <div className="flex items-center gap-3">
                    <Pill>Manchetes</Pill>
                    <Pill>BR</Pill>
                  </div>

                  <div className="mt-6 grid grid-cols-1 md:grid-cols-[1.2fr_0.8fr] gap-6">
                    <div className="rounded-3xl border border-white/10 bg-white/5 overflow-hidden min-h-[340px]">
                      {newsHero?.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={newsHero.image} alt="" className="h-[240px] w-full object-cover opacity-90" />
                      ) : (
                        <div className="h-[240px] w-full bg-white/5 flex items-center justify-center text-white/40">
                          imagem indisponível
                        </div>
                      )}
                      <div className="p-6">
                        <div className="text-xs opacity-60 tracking-widest">DESTAQUE</div>
                        <div className="mt-3 text-2xl font-semibold leading-snug">
                          {newsHero?.title || "Atualizando manchetes..."}
                        </div>
                        <div className="mt-2 text-sm text-white/60">
                          {newsHero?.source ? newsHero.source : "Google News"}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                      <div className="text-xs opacity-60 tracking-widest">PRÓXIMAS</div>
                      <div className="mt-4 space-y-4">
                        {(news.slice(0, 5) || []).map((n, i) => (
                          <div key={`${n.title}-${i}`} className="border-b border-white/10 pb-4 last:border-0 last:pb-0">
                            <div className="text-sm font-semibold leading-snug line-clamp-2">{n.title}</div>
                            <div className="text-xs text-white/50 mt-1">{n.source || "Google News"}</div>
                          </div>
                        ))}
                        {!news.length ? (
                          <div className="text-white/60 text-sm">Sem notícias no momento.</div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* FOOTER / TICKER */}
            <div className="border-t border-white/10 bg-black/35">
              <div className="px-6 py-3 flex items-center gap-4">
                <div className="flex-1 overflow-hidden whitespace-nowrap">
                  <div className="inline-block animate-[ticker_28s_linear_infinite] will-change-transform">
                    <span className="text-sm text-white/75">{tickerText}</span>
                    <span className="mx-8 text-white/20">•</span>
                    <span className="text-sm text-white/75">{tickerText}</span>
                  </div>
                </div>
                <div className="text-xs text-white/50">
                  Sync: {lastSync ? formatTimePtBR(lastSync) : "—"}
                </div>
              </div>
            </div>
          </div>

          {/* MUSIC DOCK */}
          <MusicDock />
        </div>
      </div>

      <style jsx global>{`
        @keyframes ticker {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

function PosterWall({ posterSrc }: { posterSrc: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 overflow-hidden shadow-[0_22px_70px_rgba(0,0,0,0.45)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={posterSrc}
        alt=""
        className="w-full max-h-[520px] object-contain bg-black/30"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
      <div className="p-5 text-sm text-white/60">
        {/* sem textão; só uma linha de fallback */}
        Poster de aniversário
      </div>
    </div>
  );
}
