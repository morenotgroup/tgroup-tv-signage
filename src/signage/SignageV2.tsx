"use client";

import React, { useEffect, useMemo, useState } from "react";
import { SIGNAGE_CONFIG } from "@/config";
import MusicDock from "@/components/MusicDock";

type SceneId = "welcome" | "arrivals" | "birthdays" | "weather" | "news";

type WeatherHourly = {
  timeLabel: string; // "13:00"
  tempC?: number;
  emoji?: string;
  description?: string;
};

type WeatherDaily = {
  dayLabel: string; // "seg"
  minC?: number;
  maxC?: number;
  emoji?: string;
  description?: string;
};

type WeatherPayload = {
  ok: boolean;
  tempC?: number;
  emoji?: string;
  description?: string;
  hourly?: WeatherHourly[];
  daily?: WeatherDaily[];
};

type NewsItem = {
  title: string;
  source?: string;
  url?: string;
  image?: string;
};

type BirthdayItem = {
  mmdd?: string; // "0203"
  day?: number;
  month?: number;
  name?: string;
  role?: string;
  org?: string;
  imageSrc: string;
  imageAlt?: string;
};

type BirthdaysApiResponse = {
  ok: boolean;
  items?: Array<{
    filename: string;
    src: string;
    mmdd?: string;
    day?: number;
    month?: number;
    name?: string;
    role?: string;
    org?: string;
  }>;
};

type BrandTab = {
  key: string;
  alt: string;
  logoSrc?: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeNumber(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function monthNamePt(monthIndex0: number) {
  const months = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  return months[monthIndex0] ?? "mês";
}

function formatDateLongPt(d: Date) {
  return d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function domainFromUrl(url?: string) {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function clearbitLogo(domain?: string) {
  if (!domain) return undefined;
  return `https://logo.clearbit.com/${domain}`;
}

function googleFavicon(domain?: string) {
  if (!domain) return undefined;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

/**
 * IMPORTANTÍSSIMO:
 * Removi useSearchParams() pra não quebrar build/prerender.
 * Agora TV mode lê querystring pelo window no client.
 */
function useTvMode() {
  const [tv, setTv] = useState(false);

  useEffect(() => {
    try {
      const qs = new URLSearchParams(window.location.search);
      setTv(qs.get("tv") === "1");
    } catch {
      setTv(false);
    }
  }, []);

  return tv;
}

function useClock(tickMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return now;
}

export default function SignageV2() {
  const cfg = SIGNAGE_CONFIG as any;

  const tv = useTvMode();
  const now = useClock(1000);

  const scenes: SceneId[] = useMemo(
    () => ["welcome", "arrivals", "birthdays", "weather", "news"],
    []
  );

  const sceneDurationMs = useMemo(() => {
    const fromCfg = safeNumber(cfg?.sceneDurationMs, 11000);
    return clamp(fromCfg, 8000, 20000);
  }, [cfg?.sceneDurationMs]);

  const refreshWeatherMs = useMemo(
    () => clamp(safeNumber(cfg?.refreshWeatherMs, 10 * 60_000), 60_000, 60 * 60_000),
    [cfg?.refreshWeatherMs]
  );
  const refreshNewsMs = useMemo(
    () => clamp(safeNumber(cfg?.refreshNewsMs, 7 * 60_000), 60_000, 60 * 60_000),
    [cfg?.refreshNewsMs]
  );
  const refreshBirthdaysMs = useMemo(
    () => clamp(safeNumber(cfg?.refreshBirthdaysMs, 6 * 60 * 60_000), 60_000, 48 * 60 * 60_000),
    [cfg?.refreshBirthdaysMs]
  );

  const [sceneIndex, setSceneIndex] = useState(0);
  const activeScene = scenes[sceneIndex] ?? "welcome";

  const [weather, setWeather] = useState<WeatherPayload | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [birthdays, setBirthdays] = useState<BirthdayItem[]>([]);
  const [arrivals, setArrivals] = useState<Array<{ src: string; label?: string }>>(
    () => cfg?.welcomePosters ?? cfg?.arrivalsPosters ?? []
  );

  useEffect(() => {
    const id = setInterval(() => {
      setSceneIndex((i) => (i + 1) % scenes.length);
    }, sceneDurationMs);
    return () => clearInterval(id);
  }, [sceneDurationMs, scenes.length]);

  // Weather
  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const res = await fetch("/api/weather", { cache: "no-store" });
        const json = (await res.json()) as WeatherPayload;
        if (!alive) return;
        setWeather(json);
      } catch {
        if (!alive) return;
        setWeather({ ok: false });
      }
    }

    load();
    const id = setInterval(load, refreshWeatherMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [refreshWeatherMs]);

  // News
  useEffect(() => {
    let alive = true;

    function normalizeNewsPayload(payload: any): NewsItem[] {
      const items = payload?.items ?? payload?.news ?? payload?.data ?? payload ?? [];
      if (!Array.isArray(items)) return [];

      return items
        .map((it: any) => {
          if (typeof it === "string") return { title: it } as NewsItem;
          const title = it?.title ?? it?.headline ?? it?.name ?? "";
          if (!title) return null;
          return {
            title,
            source: it?.source ?? it?.provider ?? it?.site ?? it?.origin,
            url: it?.url ?? it?.link ?? it?.href,
            image: it?.image ?? it?.thumbnail ?? it?.thumb,
          } as NewsItem;
        })
        .filter(Boolean) as NewsItem[];
    }

    async function load() {
      try {
        const res = await fetch("/api/news", { cache: "no-store" });
        const json = await res.json();
        if (!alive) return;
        const normalized = normalizeNewsPayload(json);
        setNews(normalized);
      } catch {
        if (!alive) return;
        setNews([]);
      }
    }

    load();
    const id = setInterval(load, refreshNewsMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [refreshNewsMs]);

  // Birthdays
  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const res = await fetch("/api/birthdays", { cache: "no-store" });
        const json = (await res.json()) as BirthdaysApiResponse;
        if (!alive) return;

        const items =
          (json?.items ?? []).map((it) => ({
            mmdd: it.mmdd,
            day: it.day,
            month: it.month,
            name: it.name,
            role: it.role,
            org: it.org,
            imageSrc: it.src,
            imageAlt: it.name ? `Aniversário: ${it.name}` : it.filename,
          })) ?? [];

        setBirthdays(items);
      } catch {
        if (!alive) return;
        setBirthdays([]);
      }
    }

    load();
    const id = setInterval(load, refreshBirthdaysMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [refreshBirthdaysMs]);

  // Ticker
  const tickerItems = useMemo(() => {
    const base = news.slice(0, 12).map((n) => n.title).filter(Boolean);
    if (base.length === 0) return ["T.Group • Recepção • Bem-vindas, vindes e vindos"];
    return base;
  }, [news]);

  const timeHHMM = useMemo(
    () => now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    [now]
  );
  const dateLong = useMemo(() => formatDateLongPt(now), [now]);

  const locationLabel = useMemo(() => {
    return cfg?.locationLabel ?? "Perdizes - São Paulo";
  }, [cfg?.locationLabel]);

  const tempNowLabel = useMemo(() => {
    const t = weather?.tempC;
    if (!Number.isFinite(Number(t))) return undefined;
    return `${Math.round(Number(t))}°C`;
  }, [weather?.tempC]);

  const month0 = now.getMonth();
  const month1 = month0 + 1;

  const birthdaysThisMonth = useMemo(() => {
    const filtered = birthdays.filter(
      (b) => b.month === month1 || (!b.month && b.mmdd?.startsWith(pad2(month1)))
    );
    const sorted = [...filtered].sort((a, b) => {
      const na = (a.name ?? "").toLocaleLowerCase("pt-BR");
      const nb = (b.name ?? "").toLocaleLowerCase("pt-BR");
      return na.localeCompare(nb, "pt-BR");
    });
    return sorted;
  }, [birthdays, month1]);

  const [birthdayCarouselIndex, setBirthdayCarouselIndex] = useState(0);
  useEffect(() => {
    if (birthdaysThisMonth.length <= 2) return;
    const id = setInterval(() => setBirthdayCarouselIndex((i) => i + 1), 6500);
    return () => clearInterval(id);
  }, [birthdaysThisMonth.length]);

  const birthdayShowcase = useMemo(() => {
    if (birthdaysThisMonth.length === 0) return [];
    if (birthdaysThisMonth.length <= 2) return birthdaysThisMonth;

    const a = birthdaysThisMonth[birthdayCarouselIndex % birthdaysThisMonth.length];
    const b = birthdaysThisMonth[(birthdayCarouselIndex + 1) % birthdaysThisMonth.length];
    return [a, b].filter(Boolean);
  }, [birthdaysThisMonth, birthdayCarouselIndex]);

  const [arrivalsIndex, setArrivalsIndex] = useState(0);
  useEffect(() => {
    if (!arrivals || arrivals.length <= 2) return;
    const id = setInterval(() => setArrivalsIndex((i) => i + 1), 8500);
    return () => clearInterval(id);
  }, [arrivals]);

  const arrivalsShowcase = useMemo(() => {
    if (!arrivals || arrivals.length === 0) return [];
    if (arrivals.length <= 2) return arrivals;

    const a = arrivals[arrivalsIndex % arrivals.length];
    const b = arrivals[(arrivalsIndex + 1) % arrivals.length];
    return [a, b].filter(Boolean);
  }, [arrivals, arrivalsIndex]);

  // Textos (mantém seus textos)
  const about = useMemo(() => {
    const mission =
      cfg?.mission ??
      "Criar experiências memoráveis em entretenimento, eventos e live marketing, com excelência na execução.";
    const vision =
      cfg?.vision ??
      "Ser referência em entretenimento e live marketing com performance e tecnologia.";
    const values: string[] =
      cfg?.values ?? [
        "Respeito, diversidade e segurança",
        "Excelência com leveza",
        "Dono(a) do resultado",
        "Criatividade que vira entrega",
        "Transparência e colaboração",
      ];
    return { mission, vision, values };
  }, [cfg?.mission, cfg?.vision, cfg?.values]);

  // Logos header (T.Group + tabs)
  const brandLogo = cfg?.brand?.logoSrc ?? "/signage/logos/tgroup.svg";
  const brandAlt = cfg?.brand?.alt ?? "T.Group";
  const brandSub = cfg?.brand?.sub ?? "TV Signage • Sede • Perdizes";

  const tabs: BrandTab[] = useMemo(() => {
    const raw = cfg?.brandTabs;

    if (Array.isArray(raw) && raw.length) {
      return raw
        .map((t: any) => {
          if (typeof t === "string") {
            return { key: t, alt: t, logoSrc: "" };
          }
          return {
            key: t?.key ?? t?.label ?? t?.name ?? t?.alt ?? "tab",
            alt: t?.alt ?? t?.label ?? t?.name ?? "Empresa",
            logoSrc: t?.logoSrc ?? "",
          } as BrandTab;
        })
        .filter(Boolean);
    }

    return [
      { key: "brands", alt: "T.Brands", logoSrc: "/signage/logos/tbrands.svg" },
      { key: "venues", alt: "T.Venues", logoSrc: "/signage/logos/tvenues.svg" },
      { key: "dreams", alt: "T.Dreams", logoSrc: "/signage/logos/tdreams.svg" },
      { key: "youth", alt: "T.Youth", logoSrc: "/signage/logos/tyouth.svg" },
    ];
  }, [cfg?.brandTabs]);

  return (
    <div className={`tg_root ${tv ? "tv" : ""}`} data-scene={activeScene}>
      {/* Header */}
      <header className="tg_header">
        <div className="tg_brand">
          <div className="tg_logoWrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="tg_logo" src={brandLogo} alt={brandAlt} />
          </div>

          <div className="tg_brandText">
            <div className="tg_brandSub">{brandSub}</div>
          </div>
        </div>

        <nav className="tg_tabs" aria-label="Empresas">
          {tabs.map((t) => (
            <span key={t.key} className="tg_tab tg_tabLogo" aria-label={t.alt} title={t.alt}>
              {t.logoSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="tg_tabImg"
                  src={t.logoSrc}
                  alt={t.alt}
                  onError={(e) => {
                    // se falhar, some (evita ficar quebrado)
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <span className="tg_tabText">{t.alt}</span>
              )}
            </span>
          ))}
        </nav>

        <div className="tg_clock">
          <div className="tg_time">{timeHHMM}</div>
          <div className="tg_date">{dateLong}</div>
        </div>
      </header>

      {/* Content */}
      <main className="tg_main">
        {activeScene === "welcome" && (
          <section className="tg_scene">
            <h1 className="tg_title">Bem-vindas, vindes e vindos ao T.Group</h1>

            <div className="tg_kicker">
              <span>{locationLabel}</span>
              {tempNowLabel ? (
                <>
                  <span className="dot">•</span>
                  <span>Clima agora: {tempNowLabel}</span>
                </>
              ) : null}
            </div>

            <div className="tg_welcomeTop">
              <span className="tg_welcomePill">ENTRETENIMENTO • LIVE MARKETING • PERFORMANCE • TECNOLOGIA</span>
            </div>

            {/* 3 blocos separados, coloridos, layout forte pra TV */}
            <div className="tg_welcomeGrid">
              <div className="tg_panel tg_panelMission">
                <div className="tg_panelHead">
                  <span className="tg_panelLabel">MISSÃO</span>
                </div>
                <div className="tg_panelText">{about.mission}</div>
              </div>

              <div className="tg_panel tg_panelVision">
                <div className="tg_panelHead">
                  <span className="tg_panelLabel">VISÃO</span>
                </div>
                <div className="tg_panelText">{about.vision}</div>
              </div>

              <div className="tg_panel tg_panelValues">
                <div className="tg_panelHead">
                  <span className="tg_panelLabel">VALORES</span>
                </div>
                <ul className="tg_values">
                  {about.values.map((v: string) => (
                    <li key={v} className="tg_value">
                      <span className="check" aria-hidden>
                        ✓
                      </span>
                      <span>{v}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="tg_welcomeFooterLine">
              <span className="tg_mini">Sinta-se em casa. A gente cuida do resto.</span>
            </div>
          </section>
        )}

        {activeScene === "arrivals" && (
          <section className="tg_scene">
            <div className="tg_sceneHeader">
              <h1 className="tg_title">Chegadas do mês</h1>
              <div className="tg_sceneTag">fevereiro • nova energia no ar ✨</div>
            </div>

            <div className="tg_postersRow">
              {arrivalsShowcase.length === 0 ? (
                <div className="tg_empty">
                  <div className="tg_emptyTitle">Sem artes de chegadas no momento</div>
                  <div className="tg_emptySub">
                    Quando tiver, elas aparecem aqui automaticamente (via config / posters).
                  </div>
                </div>
              ) : (
                arrivalsShowcase.slice(0, 2).map((p, idx) => (
                  <div key={`${p.src}-${idx}`} className="tg_posterFrame">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="tg_posterImg" src={p.src} alt={p.label ?? "Chegadas do mês"} />
                    {p.label ? <div className="tg_posterLabel">{p.label}</div> : null}
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {activeScene === "birthdays" && (
          <section className="tg_scene">
            <h1 className="tg_title">{`Aniversários de ${monthNamePt(month0)}`}</h1>

            <div className="tg_birthdaysGrid">
              <div className="tg_birthdaysShowcase">
                {birthdayShowcase.length === 0 ? (
                  <div className="tg_empty">
                    <div className="tg_emptyTitle">Sem aniversários cadastrados</div>
                    <div className="tg_emptySub">
                      Se você já subiu as artes no GitHub, essa tela deveria preencher sozinha. Se não preencher, o problema é a API /api/birthdays.
                    </div>
                  </div>
                ) : (
                  <div className="tg_birthdaysCards">
                    {birthdayShowcase.map((b, idx) => (
                      <div key={`${b.imageSrc}-${idx}`} className="tg_bdayFrame">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="tg_bdayImg" src={b.imageSrc} alt={b.imageAlt ?? "Aniversário"} />
                        <div className="tg_bdayOverlay">
                          <div className="tg_bdayName">{b.name ?? "Aniversariante"}</div>
                          <div className="tg_bdayMeta">
                            {b.day && b.month ? (
                              <span>
                                {b.day} de {monthNamePt((b.month ?? month1) - 1)}
                              </span>
                            ) : null}
                            {b.role || b.org ? <span className="dot">•</span> : null}
                            {b.role ? <span>{b.role}</span> : null}
                            {b.org ? (
                              <>
                                <span className="dot">•</span>
                                <span>{b.org}</span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="tg_birthdaysList">
                <div className="tg_listTitle">Lista do mês</div>
                {birthdaysThisMonth.length === 0 ? (
                  <div className="tg_listEmpty">Sem itens neste mês.</div>
                ) : (
                  <ul className="tg_list">
                    {birthdaysThisMonth.map((b, idx) => (
                      <li key={`${b.imageSrc}-${idx}`} className="tg_listItem">
                        <span className="tg_bullet" aria-hidden />
                        <span className="tg_listLine">
                          <b>{b.name ?? "—"}</b>
                          {b.day && b.month ? (
                            <span className="tg_listDim">{` • ${b.day} de ${monthNamePt((b.month ?? month1) - 1)}`}</span>
                          ) : null}
                          {b.role ? <span className="tg_listDim">{` • ${b.role}`}</span> : null}
                          {b.org ? <span className="tg_listDim">{` • ${b.org}`}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        )}

        {activeScene === "weather" && (
          <section className="tg_scene">
            <h1 className="tg_title">Clima</h1>

            <div className="tg_weatherGrid">
              <div className="tg_weatherNow">
                <div className="tg_weatherBig">
                  <div className="tg_weatherEmoji" aria-hidden>
                    {weather?.emoji ?? "⛅️"}
                  </div>
                  <div>
                    <div className="tg_weatherTemp">{tempNowLabel ?? "—"}</div>
                    <div className="tg_weatherDesc">{weather?.description ?? "São Paulo"}</div>
                  </div>
                </div>
              </div>

              <div className="tg_weatherNext">
                <div className="tg_panelTitle">Próximos dias</div>
                <div className="tg_daysRow">
                  {(weather?.daily ?? []).slice(0, 5).map((d, i) => (
                    <div key={`${d.dayLabel}-${i}`} className="tg_dayCard">
                      <div className="tg_dayLabel">{d.dayLabel}</div>
                      <div className="tg_dayEmoji" aria-hidden>
                        {d.emoji ?? "⛅️"}
                      </div>
                      <div className="tg_dayTemps">
                        <span>{Number.isFinite(Number(d.maxC)) ? `${Math.round(Number(d.maxC))}°` : "—"}</span>
                        <span className="tg_dim">
                          {Number.isFinite(Number(d.minC)) ? `${Math.round(Number(d.minC))}°` : "—"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="tg_weatherHourly">
                <div className="tg_panelTitle">Hoje (próximas horas)</div>
                <div className="tg_hoursRow">
                  {(weather?.hourly ?? []).slice(0, 8).map((h, i) => (
                    <div key={`${h.timeLabel}-${i}`} className="tg_hourCard">
                      <div className="tg_hourLabel">{h.timeLabel}</div>
                      <div className="tg_hourEmoji" aria-hidden>
                        {h.emoji ?? "⛅️"}
                      </div>
                      <div className="tg_hourTemp">
                        {Number.isFinite(Number(h.tempC)) ? `${Math.round(Number(h.tempC))}°` : "—"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {activeScene === "news" && (
          <section className="tg_scene">
            <h1 className="tg_title">News</h1>

            <div className="tg_newsGrid">
              <div className="tg_newsFeatured">
                {news[0] ? (
                  <NewsCard item={news[0]} featured />
                ) : (
                  <div className="tg_empty">
                    <div className="tg_emptyTitle">Carregando notícias…</div>
                    <div className="tg_emptySub">Se a API estiver ok, já já entra.</div>
                  </div>
                )}
              </div>

              <div className="tg_newsList">
                {news.slice(1, 7).map((it, idx) => (
                  <NewsCard key={`${it.title}-${idx}`} item={it} />
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Footer / Ticker */}
      <footer className="tg_footer">
        <div className="tg_livePill">
          <span className="tg_liveDot" aria-hidden />
          <span>AO VIVO</span>
        </div>

        <div className="tg_ticker">
          <div className="tg_tickerFade left" />
          <div className="tg_tickerFade right" />
          <div className="tg_tickerTrack" style={{ ["--tickerDuration" as any]: "60s" }}>
            <div className="tg_tickerRow">
              {tickerItems.map((t, idx) => (
                <span key={`${t}-${idx}`} className="tg_tickerItem">
                  {t}
                  <span className="sep">•</span>
                </span>
              ))}
              {tickerItems.map((t, idx) => (
                <span key={`${t}-dup-${idx}`} className="tg_tickerItem">
                  {t}
                  <span className="sep">•</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="tg_footerPills">
          {tempNowLabel ? <span className="tg_chip">{tempNowLabel}</span> : null}
          <span className="tg_chip">Sede • Perdizes</span>
        </div>
      </footer>

      {/* MusicDock */}
      <div className="tg_musicDock">
        <MusicDock />
      </div>

      <GlobalStyles />
    </div>
  );
}

function NewsCard({ item, featured }: { item: NewsItem; featured?: boolean }) {
  const domain = domainFromUrl(item.url);
  const logo = clearbitLogo(domain);
  const favicon = googleFavicon(domain);
  const mediaSrc = item.image || logo || favicon;

  return (
    <article className={`tg_newsCard ${featured ? "featured" : ""}`}>
      <div className="tg_newsMedia">
        {mediaSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="tg_newsImg"
            src={mediaSrc}
            alt=""
            onError={(e) => {
              const img = e.currentTarget;
              if (logo && img.src !== logo) img.src = logo;
              else if (favicon && img.src !== favicon) img.src = favicon;
            }}
          />
        ) : (
          <div className="tg_newsMediaFallback" />
        )}
      </div>

      <div className="tg_newsBody">
        <div className="tg_newsTitle">{item.title}</div>
        <div className="tg_newsMeta">
          <span className="tg_newsSource">{item.source ?? domain ?? "notícias"}</span>
          {domain ? <span className="tg_newsDomain">{domain}</span> : null}
        </div>
      </div>
    </article>
  );
}

function GlobalStyles() {
  return (
    <style jsx global>{`
      @import url("https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800;900&display=swap");

      .tg_root {
        min-height: 100vh;
        position: relative;
        overflow: hidden;
        color: #fff;
        font-family: "Montserrat", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial;
        background: radial-gradient(1100px 600px at 12% 18%, rgba(60, 80, 255, 0.35), transparent 55%),
          radial-gradient(900px 700px at 85% 15%, rgba(0, 220, 180, 0.26), transparent 60%),
          radial-gradient(1000px 800px at 70% 90%, rgba(255, 30, 140, 0.22), transparent 60%),
          radial-gradient(900px 700px at 15% 92%, rgba(255, 140, 30, 0.16), transparent 60%),
          #05060b;
      }

      .tg_root[data-scene="news"] {
        background: radial-gradient(900px 600px at 10% 20%, rgba(255, 60, 120, 0.28), transparent 55%),
          radial-gradient(900px 700px at 80% 20%, rgba(60, 140, 255, 0.24), transparent 60%),
          radial-gradient(1000px 800px at 60% 95%, rgba(0, 220, 180, 0.18), transparent 60%),
          #05060b;
      }

      .tg_root[data-scene="weather"] {
        background: radial-gradient(1000px 700px at 15% 20%, rgba(0, 220, 180, 0.28), transparent 60%),
          radial-gradient(900px 650px at 80% 20%, rgba(255, 140, 30, 0.22), transparent 60%),
          radial-gradient(900px 700px at 55% 95%, rgba(60, 80, 255, 0.20), transparent 60%),
          #05060b;
      }

      .tg_root::before {
        content: "";
        position: absolute;
        inset: -20%;
        background: radial-gradient(circle at 25% 30%, rgba(255, 255, 255, 0.05), transparent 35%),
          radial-gradient(circle at 70% 75%, rgba(255, 255, 255, 0.04), transparent 40%);
        filter: blur(40px);
        pointer-events: none;
      }

      .tg_header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        padding: 22px 26px 14px;
      }

      .tg_brand {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 280px;
      }

      .tg_logoWrap {
        width: 54px;
        height: 54px;
        border-radius: 16px;
        display: grid;
        place-items: center;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: 0 12px 34px rgba(0, 0, 0, 0.35);
        overflow: hidden;
      }

      .tg_logo {
        width: 74%;
        height: 74%;
        object-fit: contain;
        opacity: 0.96;
        filter: drop-shadow(0 10px 18px rgba(0, 0, 0, 0.35));
      }

      .tg_brandSub {
        opacity: 0.75;
        font-size: 12px;
      }

      .tg_tabs {
        display: flex;
        gap: 10px;
        padding: 10px 14px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(10px);
      }

      .tg_tab {
        font-size: 12px;
        letter-spacing: 0.14em;
        opacity: 0.95;
        padding: 7px 12px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(0, 0, 0, 0.12);
      }

      .tg_tab.tg_tabLogo {
        display: grid;
        place-items: center;
        width: 74px;
        height: 38px;
        padding: 0;
      }

      .tg_tabImg {
        width: 46px;
        height: 20px;
        object-fit: contain;
        opacity: 0.92;
        filter: drop-shadow(0 8px 14px rgba(0, 0, 0, 0.35));
      }

      .tg_tabText {
        font-size: 11px;
        letter-spacing: 0.12em;
        opacity: 0.9;
      }

      .tg_clock {
        text-align: right;
        min-width: 260px;
      }

      .tg_time {
        font-weight: 900;
        font-size: 56px;
        letter-spacing: -0.06em;
        line-height: 0.95;
      }

      .tg_date {
        opacity: 0.8;
        font-size: 14px;
        margin-top: 6px;
      }

      .tg_main {
        padding: 8px 26px 98px;
      }

      .tg_scene {
        border-radius: 28px;
        border: 1px solid rgba(255, 255, 255, 0.10);
        background: rgba(0, 0, 0, 0.18);
        backdrop-filter: blur(14px);
        box-shadow: 0 30px 90px rgba(0, 0, 0, 0.45);
        padding: 28px;
        min-height: calc(100vh - 190px);
      }

      .tg_sceneHeader {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 16px;
      }

      .tg_sceneTag {
        opacity: 0.85;
        font-size: 14px;
      }

      .tg_title {
        font-weight: 900;
        letter-spacing: -0.05em;
        font-size: 54px;
        margin: 0 0 10px;
        line-height: 1.04;
      }

      .tg_kicker {
        opacity: 0.85;
        font-size: 14px;
        display: flex;
        gap: 10px;
        align-items: center;
        margin-bottom: 18px;
      }

      .dot {
        opacity: 0.6;
      }

      /* Welcome */
      .tg_welcomeTop {
        display: flex;
        justify-content: flex-end;
        margin-bottom: 14px;
      }

      .tg_welcomePill {
        padding: 10px 14px;
        border-radius: 999px;
        font-size: 12px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        border: 1px solid rgba(255, 255, 255, 0.10);
        background: rgba(0, 0, 0, 0.16);
        opacity: 0.9;
      }

      .tg_welcomeGrid {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 16px;
        align-items: stretch;
        margin-top: 6px;
      }

      .tg_panel {
        position: relative;
        border-radius: 26px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        overflow: hidden;
        padding: 20px;
        box-shadow: 0 22px 60px rgba(0, 0, 0, 0.38);
      }

      .tg_panel::before {
        content: "";
        position: absolute;
        inset: 0;
        background: radial-gradient(900px 420px at 20% 20%, rgba(255,255,255,0.18), transparent 60%);
        opacity: 0.35;
        pointer-events: none;
      }

      .tg_panelHead {
        position: relative;
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }

      .tg_panelLabel {
        position: relative;
        padding: 8px 12px;
        border-radius: 999px;
        font-size: 12px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        border: 1px solid rgba(255, 255, 255, 0.14);
        background: rgba(0, 0, 0, 0.12);
      }

      .tg_panelText {
        position: relative;
        font-size: 28px;
        line-height: 1.12;
        font-weight: 900;
        letter-spacing: -0.03em;
      }

      .tg_panelMission {
        background:
          linear-gradient(135deg, rgba(255, 70, 160, 0.38), rgba(120, 70, 255, 0.22)),
          rgba(0, 0, 0, 0.10);
      }

      .tg_panelVision {
        background:
          linear-gradient(135deg, rgba(40, 140, 255, 0.38), rgba(30, 220, 190, 0.18)),
          rgba(0, 0, 0, 0.10);
      }

      .tg_panelValues {
        background:
          linear-gradient(135deg, rgba(70, 255, 120, 0.28), rgba(255, 220, 60, 0.10)),
          rgba(0, 0, 0, 0.10);
      }

      .tg_values {
        position: relative;
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 10px;
        margin-top: 6px;
      }

      .tg_value {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        font-size: 16px;
        font-weight: 800;
        opacity: 0.95;
      }

      .check {
        width: 22px;
        height: 22px;
        border-radius: 10px;
        display: grid;
        place-items: center;
        background: rgba(255, 255, 255, 0.10);
        border: 1px solid rgba(255, 255, 255, 0.12);
        flex: 0 0 22px;
        margin-top: 1px;
      }

      .tg_welcomeFooterLine {
        margin-top: 14px;
        opacity: 0.8;
        font-size: 12px;
      }

      /* Posters (Arrivals) */
      .tg_postersRow {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        margin-top: 18px;
      }

      .tg_posterFrame {
        position: relative;
        border-radius: 22px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(255, 255, 255, 0.03);
        overflow: hidden;
        height: 62vh;
      }

      .tg_posterImg {
        width: 100%;
        height: 100%;
        object-fit: contain;
        padding: 18px;
        filter: drop-shadow(0 20px 35px rgba(0, 0, 0, 0.55));
      }

      .tg_posterLabel {
        position: absolute;
        left: 16px;
        bottom: 16px;
        padding: 10px 12px;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.25);
        border: 1px solid rgba(255, 255, 255, 0.10);
        font-size: 13px;
      }

      /* Birthdays */
      .tg_birthdaysGrid {
        display: grid;
        grid-template-columns: 1.2fr 0.8fr;
        gap: 16px;
        margin-top: 14px;
      }

      .tg_birthdaysShowcase {
        border-radius: 22px;
        border: 1px solid rgba(255, 255, 255, 0.10);
        background: rgba(255, 255, 255, 0.03);
        padding: 14px;
      }

      .tg_birthdaysCards {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
      }

      .tg_bdayFrame {
        position: relative;
        border-radius: 20px;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(0, 0, 0, 0.2);
        height: 52vh;
      }

      .tg_bdayImg {
        width: 100%;
        height: 100%;
        object-fit: contain;
        padding: 14px;
      }

      .tg_bdayOverlay {
        position: absolute;
        left: 12px;
        right: 12px;
        bottom: 12px;
        padding: 12px 12px;
        border-radius: 16px;
        background: rgba(0, 0, 0, 0.32);
        border: 1px solid rgba(255, 255, 255, 0.10);
        backdrop-filter: blur(10px);
      }

      .tg_bdayName {
        font-weight: 900;
        letter-spacing: -0.03em;
        font-size: 16px;
        margin-bottom: 3px;
      }

      .tg_bdayMeta {
        font-size: 12px;
        opacity: 0.86;
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
      }

      .tg_birthdaysList {
        border-radius: 22px;
        border: 1px solid rgba(255, 255, 255, 0.10);
        background: rgba(255, 255, 255, 0.03);
        padding: 14px 14px 10px;
      }

      .tg_listTitle {
        font-weight: 900;
        letter-spacing: -0.02em;
        margin-bottom: 10px;
      }

      .tg_listEmpty {
        opacity: 0.7;
        font-size: 13px;
      }

      .tg_list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 10px;
      }

      .tg_listItem {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        padding: 12px;
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(0, 0, 0, 0.16);
      }

      .tg_bullet {
        width: 10px;
        height: 10px;
        margin-top: 6px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.85);
        opacity: 0.9;
        flex: 0 0 10px;
      }

      .tg_listLine {
        font-size: 14px;
        line-height: 1.2;
      }

      .tg_listDim {
        opacity: 0.75;
        font-weight: 600;
      }

      /* Weather */
      .tg_weatherGrid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        grid-template-rows: auto auto;
        gap: 16px;
        margin-top: 16px;
      }

      .tg_weatherNow,
      .tg_weatherNext,
      .tg_weatherHourly {
        border-radius: 22px;
        border: 1px solid rgba(255, 255, 255, 0.10);
        background: rgba(255, 255, 255, 0.03);
        padding: 14px;
      }

      .tg_weatherHourly {
        grid-column: 1 / span 2;
      }

      .tg_weatherBig {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 10px;
      }

      .tg_weatherEmoji {
        font-size: 52px;
      }

      .tg_weatherTemp {
        font-weight: 900;
        font-size: 54px;
        letter-spacing: -0.06em;
        line-height: 0.95;
      }

      .tg_weatherDesc {
        opacity: 0.82;
        font-size: 14px;
        margin-top: 6px;
      }

      .tg_panelTitle {
        font-weight: 900;
        margin-bottom: 10px;
        opacity: 0.95;
      }

      .tg_daysRow,
      .tg_hoursRow {
        display: flex;
        gap: 10px;
        overflow: hidden;
      }

      .tg_dayCard,
      .tg_hourCard {
        flex: 1;
        min-width: 0;
        border-radius: 16px;
        padding: 12px 10px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(0, 0, 0, 0.16);
        text-align: center;
      }

      .tg_dayLabel,
      .tg_hourLabel {
        font-size: 12px;
        opacity: 0.8;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .tg_dayEmoji,
      .tg_hourEmoji {
        font-size: 22px;
        margin: 8px 0 6px;
      }

      .tg_dayTemps {
        display: flex;
        justify-content: center;
        gap: 8px;
        font-weight: 900;
      }

      .tg_dim {
        opacity: 0.6;
        font-weight: 800;
      }

      .tg_hourTemp {
        font-weight: 900;
        font-size: 18px;
      }

      /* News */
      .tg_newsGrid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 14px;
        margin-top: 12px;
      }

      .tg_newsFeatured {
        min-height: 160px;
      }

      .tg_newsList {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }

      .tg_newsCard {
        display: grid;
        grid-template-columns: 84px 1fr;
        gap: 12px;
        align-items: center;
        padding: 14px;
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.10);
        background: rgba(255, 255, 255, 0.03);
        overflow: hidden;
      }

      .tg_newsCard.featured {
        grid-template-columns: 140px 1fr;
        padding: 18px;
        border-radius: 24px;
        background: rgba(0, 0, 0, 0.18);
      }

      .tg_newsMedia {
        width: 100%;
        height: 84px;
        border-radius: 18px;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.10);
        background: rgba(0, 0, 0, 0.18);
        display: grid;
        place-items: center;
      }

      .tg_newsCard.featured .tg_newsMedia {
        height: 140px;
        border-radius: 22px;
      }

      .tg_newsImg {
        width: 100%;
        height: 100%;
        object-fit: cover;
        filter: saturate(1.05) contrast(1.03);
      }

      .tg_newsBody {
        min-width: 0;
      }

      .tg_newsTitle {
        font-weight: 900;
        letter-spacing: -0.02em;
        font-size: 16px;
        line-height: 1.15;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .tg_newsCard.featured .tg_newsTitle {
        font-size: 20px;
        -webkit-line-clamp: 4;
      }

      .tg_newsMeta {
        margin-top: 8px;
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        opacity: 0.78;
        font-size: 12px;
      }

      .tg_newsDomain {
        opacity: 0.85;
      }

      /* Footer / ticker */
      .tg_footer {
        position: fixed;
        left: 18px;
        right: 18px;
        bottom: 14px;
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 12px;
        align-items: center;
        pointer-events: none;
      }

      .tg_livePill {
        display: inline-flex;
        gap: 10px;
        align-items: center;
        padding: 12px 14px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.10);
        background: rgba(0, 0, 0, 0.28);
        backdrop-filter: blur(12px);
        font-weight: 900;
        letter-spacing: 0.12em;
        font-size: 12px;
      }

      .tg_liveDot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: #ff3b3b;
        box-shadow: 0 0 0 6px rgba(255, 59, 59, 0.18);
      }

      .tg_ticker {
        position: relative;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.10);
        background: rgba(0, 0, 0, 0.24);
        backdrop-filter: blur(12px);
        overflow: hidden;
        padding: 10px 0;
      }

      .tg_tickerFade {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 80px;
        z-index: 2;
      }

      .tg_tickerFade.left {
        left: 0;
        background: linear-gradient(90deg, rgba(0, 0, 0, 0.55), transparent);
      }

      .tg_tickerFade.right {
        right: 0;
        background: linear-gradient(270deg, rgba(0, 0, 0, 0.55), transparent);
      }

      .tg_tickerTrack {
        position: relative;
        z-index: 1;
        overflow: hidden;
      }

      .tg_tickerRow {
        display: inline-flex;
        white-space: nowrap;
        align-items: center;
        gap: 14px;
        padding-left: 18px;
        animation: tgMarquee var(--tickerDuration, 60s) linear infinite;
      }

      .tg_tickerItem {
        font-size: 13px;
        opacity: 0.9;
      }

      .sep {
        margin-left: 12px;
        opacity: 0.55;
      }

      @keyframes tgMarquee {
        from { transform: translateX(0); }
        to { transform: translateX(-50%); }
      }

      .tg_footerPills {
        display: inline-flex;
        gap: 10px;
        justify-content: flex-end;
        align-items: center;
      }

      .tg_chip {
        padding: 12px 14px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.10);
        background: rgba(0, 0, 0, 0.28);
        backdrop-filter: blur(12px);
        font-weight: 900;
        font-size: 12px;
        opacity: 0.9;
      }

      /* MusicDock posicionado */
      .tg_musicDock {
        position: fixed;
        left: 18px;
        bottom: 84px;
        z-index: 50;
        transform: scale(0.92);
        transform-origin: left bottom;
      }

      /* Empty */
      .tg_empty {
        height: 100%;
        min-height: 180px;
        border-radius: 22px;
        border: 1px solid rgba(255, 255, 255, 0.10);
        background: rgba(255, 255, 255, 0.03);
        display: grid;
        place-items: center;
        padding: 22px;
        text-align: center;
      }

      .tg_emptyTitle {
        font-weight: 900;
        letter-spacing: -0.03em;
        font-size: 18px;
        margin-bottom: 6px;
      }

      .tg_emptySub {
        opacity: 0.75;
        font-size: 13px;
        max-width: 520px;
      }

      /* TV mode */
      .tg_root.tv .tg_time {
        font-size: 54px;
      }

      .tg_root.tv .tg_title {
        font-size: 46px;
      }

      .tg_root.tv .tg_scene {
        padding: 26px;
      }

      .tg_root.tv .tg_panelText {
        font-size: 26px;
      }
    `}</style>
  );
}
