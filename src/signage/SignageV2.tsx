"use client";

/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useMemo, useState } from "react";
import { SIGNAGE_CONFIG } from "@/config";
import MusicDock from "@/components/MusicDock";

type SceneId = "welcome" | "gc" | "arrivals" | "birthdays" | "weather" | "news";

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

  // extras para “Alertas do dia” + “Resumo operacional”
  popTodayMax?: number; // precip prob max (%)
  uvTodayMax?: number; // uv max
  windTodayMaxKmh?: number; // km/h
  sunsetTime?: string; // "18:41"
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

type GcEvent = {
  startISO: string; // "2026-02-24T20:00:00-03:00"
  title: string;
  subtitle?: string;
  location?: string;
  icon?: string; // emoji ok (ou você troca por svg depois)
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

function weekdayPtShort(d: Date) {
  const w = d.toLocaleDateString("pt-BR", { weekday: "short" });
  return w.replace(".", "").toLowerCase();
}

function formatDateLongPt(d: Date) {
  return d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatHourMinutePt(d: Date) {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function domainFromUrl(url?: string) {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

// tira caracteres “quebrados” comuns + normaliza unicode (ajuda ticker e títulos)
function normalizeText(s?: string) {
  if (!s) return "";
  try {
    return s.normalize("NFC").replace(/\uFFFD/g, "").trim();
  } catch {
    return String(s).replace(/\uFFFD/g, "").trim();
  }
}

/**
 * TV Mode (sem useSearchParams -> evita erro de prerender/suspense)
 */
function useTvMode() {
  const [tv, setTv] = useState(false);
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      setTv(params.get("tv") === "1");
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

  // ordem das telas
  const scenes: SceneId[] = useMemo(
    () => ["welcome", "gc", "arrivals", "birthdays", "weather", "news"],
    []
  );

  // Tempo de cada tela (padrão 11s)
  const sceneDurationMs = useMemo(() => {
    const fromCfg = safeNumber(cfg?.sceneDurationMs, 11000);
    return clamp(fromCfg, 8000, 20000);
  }, [cfg?.sceneDurationMs]);

  // refreshers
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

  // Data
  const [weather, setWeather] = useState<WeatherPayload | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [birthdays, setBirthdays] = useState<BirthdayItem[]>([]);
  const [arrivals, setArrivals] = useState<Array<{ src: string; label?: string }>>(
    () => cfg?.welcomePosters ?? cfg?.arrivalsPosters ?? []
  );

  // Rotação de telas
  useEffect(() => {
    const id = setInterval(() => {
      setSceneIndex((i) => (i + 1) % scenes.length);
    }, sceneDurationMs);
    return () => clearInterval(id);
  }, [sceneDurationMs, scenes.length]);

  // Fetch Weather
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

  // Fetch News (RSS robusto)
  useEffect(() => {
    let alive = true;

    function normalizeNewsPayload(payload: any): NewsItem[] {
      const items = payload?.items ?? payload?.news ?? payload?.data ?? payload ?? [];
      if (!Array.isArray(items)) return [];

      return items
        .map((it: any) => {
          if (typeof it === "string") return { title: normalizeText(it) } as NewsItem;
          const title = normalizeText(it?.title ?? it?.headline ?? it?.name ?? "");
          if (!title) return null;
          return {
            title,
            source: normalizeText(it?.source ?? it?.provider ?? it?.site ?? it?.origin),
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

  // Fetch Birthdays
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
    const base = news
      .slice(0, 14)
      .map((n) => normalizeText(n.title))
      .filter(Boolean);
    if (base.length === 0) return ["T.Group • Recepção • Bem-vindas, vindes e vindos"];
    return base;
  }, [news]);

  // Header data
  const timeHHMM = useMemo(() => now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }), [now]);
  const dateLong = useMemo(() => formatDateLongPt(now), [now]);

  const locationLabel = useMemo(() => {
    return cfg?.locationLabel ?? "Perdizes - São Paulo";
  }, [cfg?.locationLabel]);

  const tempNowLabel = useMemo(() => {
    const t = weather?.tempC;
    if (!Number.isFinite(Number(t))) return undefined;
    return `${Math.round(Number(t))}°C`;
  }, [weather?.tempC]);

  // Birthdays do mês atual
  const month0 = now.getMonth();
  const month1 = month0 + 1;
  const birthdaysThisMonth = useMemo(() => {
    const filtered = birthdays.filter((b) => b.month === month1 || (!b.month && b.mmdd?.startsWith(pad2(month1))));
    const sorted = [...filtered].sort((a, b) => {
      const na = (a.name ?? "").toLocaleLowerCase("pt-BR");
      const nb = (b.name ?? "").toLocaleLowerCase("pt-BR");
      return na.localeCompare(nb, "pt-BR");
    });
    return sorted;
  }, [birthdays, month1]);

  // Duas artes rodando (aniversários)
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

  /**
   * ARRIVALS — 3 imagens na tela.
   * Se tiver “volume” (mais de 4), alterna páginas (ex.: 3 + restante).
   */
  const arrivalsPages = useMemo(() => {
    const list = arrivals ?? [];
    if (list.length === 0) return [] as Array<Array<{ src: string; label?: string }>>;

    const perPage = 3;
    const needsSecond = list.length > 4; // sua regra
    if (!needsSecond) return [list.slice(0, perPage)];

    const pages: Array<Array<{ src: string; label?: string }>> = [];
    for (let i = 0; i < list.length; i += perPage) pages.push(list.slice(i, i + perPage));
    return pages.slice(0, 2); // mantém “duas telas” no máximo, do jeitinho que você pediu
  }, [arrivals]);

  const [arrivalsPageIndex, setArrivalsPageIndex] = useState(0);
  useEffect(() => {
    if (arrivalsPages.length <= 1) return;
    const id = setInterval(() => setArrivalsPageIndex((i) => (i + 1) % arrivalsPages.length), 8500);
    return () => clearInterval(id);
  }, [arrivalsPages.length]);

  const arrivalsShowcase = useMemo(() => {
    return arrivalsPages[arrivalsPageIndex] ?? [];
  }, [arrivalsPages, arrivalsPageIndex]);

  // About texts (mantém seu texto)
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

  // LOGOS — usa seus arquivos em /public/signage/logos
  const headerBrandLogo = useMemo(() => cfg?.tgroupLogo ?? "/signage/logos/tgroup-logo.png", [cfg?.tgroupLogo]);

  const brandTabs = useMemo(() => {
    // prioridade: config; fallback: seus pngs
    const raw = cfg?.brandTabs;
    if (Array.isArray(raw) && raw.length) {
      return raw
        .map((t: any) => {
          if (typeof t === "string") return { label: t, logo: undefined, alt: t };
          return { label: t?.label ?? t?.name ?? "", logo: t?.logo, alt: t?.alt ?? t?.label ?? t?.name ?? "" };
        })
        .filter((x: any) => x.label);
    }

    return [
      { label: "BRANDS", logo: "/signage/logos/tbrands.png", alt: "T.Brands" },
      { label: "VENUES", logo: "/signage/logos/tvenues.png", alt: "T.Venues" },
      { label: "DREAMS", logo: "/signage/logos/tdreams.png", alt: "T.Dreams" },
      { label: "YOUTH", logo: "/signage/logos/tyouth.png", alt: "T.Youth" },
    ];
  }, [cfg?.brandTabs]);

  // AGENDA GC — fevereiro (pode jogar pro config depois se quiser)
  const gcEvents: GcEvent[] = useMemo(() => {
    const fromCfg = cfg?.gcEvents;
    if (Array.isArray(fromCfg) && fromCfg.length) return fromCfg as GcEvent[];

    return [
      {
        startISO: "2026-02-24T20:00:00-03:00",
        title: "Esportes T.Group",
        subtitle: "Vôlei de areia",
        location: "Playball",
        icon: "🏐",
      },
      {
        startISO: "2026-02-26T17:00:00-03:00",
        title: "Café com T",
        subtitle: "Conexão + updates",
        location: "Sede",
        icon: "☕️",
      },
      {
        startISO: "2026-02-26T18:20:00-03:00",
        title: "Parabéns do mês",
        subtitle: "Aniversariantes de fevereiro",
        location: "Sede",
        icon: "🎂",
      },
      {
        startISO: "2026-02-26T18:30:00-03:00",
        title: "Happy Hour T.Group",
        subtitle: "Fechamento do dia com a galera",
        location: "Sede",
        icon: "🍻",
      },
    ];
  }, [cfg?.gcEvents]);

  const gcEventsSorted = useMemo(() => {
    const parsed = gcEvents
      .map((e) => ({ ...e, _d: new Date(e.startISO) }))
      .sort((a, b) => a._d.getTime() - b._d.getTime());
    return parsed;
  }, [gcEvents]);

  const nextGcEvent = useMemo(() => {
    const future = gcEventsSorted.find((e) => e._d.getTime() >= now.getTime());
    return future ?? gcEventsSorted[0];
  }, [gcEventsSorted, now]);

  // WEATHER EXTRAS (alertas + resumo)
  const weatherAlerts = useMemo(() => {
    const out: Array<{ icon: string; label: string }> = [];
    const pop = weather?.popTodayMax;
    const uv = weather?.uvTodayMax;
    const wind = weather?.windTodayMaxKmh;

    if (Number.isFinite(Number(pop)) && Number(pop) >= 60) out.push({ icon: "🌧️", label: "Chuva provável" });
    if (Number.isFinite(Number(uv)) && Number(uv) >= 7) out.push({ icon: "🧴", label: "UV alto — evitar sol" });
    if (Number.isFinite(Number(wind)) && Number(wind) >= 25) out.push({ icon: "💨", label: "Vento forte — atenção entrada" });

    return out.slice(0, 3);
  }, [weather?.popTodayMax, weather?.uvTodayMax, weather?.windTodayMaxKmh]);

  const weatherSummaryLine = useMemo(() => {
    const t = tempNowLabel ?? "—";
    const pop = Number.isFinite(Number(weather?.popTodayMax)) ? `${Math.round(Number(weather?.popTodayMax))}%` : "—";
    const wind = Number.isFinite(Number(weather?.windTodayMaxKmh)) ? `${Math.round(Number(weather?.windTodayMaxKmh))}km/h` : "—";
    const sunset = weather?.sunsetTime ? weather.sunsetTime : "—";
    return `Hoje: ${t} • Chuva ${pop} • Vento ${wind} • Pôr do sol ${sunset}`;
  }, [tempNowLabel, weather?.popTodayMax, weather?.windTodayMaxKmh, weather?.sunsetTime]);

  const newsItems = useMemo(() => {
    // prioriza itens com imagem, pra parar de repetir favicon
    const withImg = news.filter((n) => !!n.image);
    const withoutImg = news.filter((n) => !n.image);
    return [...withImg, ...withoutImg].slice(0, 9);
  }, [news]);

  return (
    <div className={`tg_root ${tv ? "tv" : ""}`} data-scene={activeScene}>
      {/* Header */}
      <header className="tg_header">
        <div className="tg_brand">
          <div className="tg_brandLogoWrap" aria-hidden>
            <img
              className="tg_brandLogo"
              src={headerBrandLogo}
              alt=""
              onError={(e) => {
                // se quebrar, mostra fallback com texto
                const el = e.currentTarget;
                el.style.display = "none";
              }}
            />
            <div className="tg_brandFallback">T.</div>
          </div>

          <div className="tg_brandText">
            <div className="tg_brandName">T.Group</div>
            <div className="tg_brandSub">TV Signage • Sede • Perdizes</div>
          </div>
        </div>

        <nav className="tg_tabs" aria-label="Empresas">
          {brandTabs.map((t: any) => (
            <span key={t.label} className="tg_tab">
              {t.logo ? (
                <img
                  className="tg_tabLogo"
                  src={t.logo}
                  alt={t.alt ?? t.label}
                  onError={(e) => {
                    // fallback para texto se logo falhar
                    const img = e.currentTarget;
                    img.style.display = "none";
                  }}
                />
              ) : null}
              <span className="tg_tabText">{t.label}</span>
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
            <div className="tg_sceneHeader">
              <h1 className="tg_title">Bem-vindas, vindes e vindos ao T.Group</h1>
              <div className="tg_sceneTag">entretenimento • live marketing • performance • tecnologia</div>
            </div>

            <div className="tg_kicker">
              <span>{locationLabel}</span>
              {tempNowLabel ? (
                <>
                  <span className="dot">•</span>
                  <span>Clima agora: {tempNowLabel}</span>
                </>
              ) : null}
            </div>

            {/* MVV GRANDÃO (modelo que você curtiu) */}
            <div className="tg_mvvGrid">
              <div className="tg_mvvCard mission">
                <div className="tg_mvvTop">
                  <span className="tg_mvvPill">MISSÃO</span>
                </div>
                <div className="tg_mvvBig">{about.mission}</div>
                <div className="tg_mvvMini">Do briefing ao aplauso — com execução impecável.</div>
              </div>

              <div className="tg_mvvCard vision">
                <div className="tg_mvvTop">
                  <span className="tg_mvvPill">VISÃO</span>
                </div>
                <div className="tg_mvvBig">{about.vision}</div>
                <div className="tg_mvvMini">Performance real + tecnologia, sem perder o brilho.</div>
              </div>

              <div className="tg_mvvCard values">
                <div className="tg_mvvTop">
                  <span className="tg_mvvPill">VALORES</span>
                </div>
                <ul className="tg_valuesList">
                  {about.values.map((v: string) => (
                    <li key={v} className="tg_valueItem">
                      <span className="tg_check" aria-hidden>
                        ✓
                      </span>
                      <span>{v}</span>
                    </li>
                  ))}
                </ul>
                <div className="tg_mvvMini">Cultura aqui não é frase bonita — é operação.</div>
              </div>
            </div>

            <div className="tg_welcomeBottom">
              <span className="tg_mini">Sinta-se em casa. A gente cuida do resto.</span>
            </div>
          </section>
        )}

        {activeScene === "gc" && (
          <section className="tg_scene">
            <div className="tg_sceneHeader">
              <h1 className="tg_title">Agenda GC</h1>
              <div className="tg_sceneTag">{`fevereiro • o que rola com a galera`}</div>
            </div>

            <div className="tg_gcGrid">
              <div className="tg_gcHero">
                <div className="tg_gcHeroTop">
                  <span className="tg_gcPill">PRÓXIMO</span>
                  <span className="tg_gcMonth">{monthNamePt(now.getMonth())}</span>
                </div>

                {nextGcEvent ? (
                  <>
                    <div className="tg_gcHeroTitle">
                      <span className="tg_gcHeroIcon" aria-hidden>
                        {nextGcEvent.icon ?? "✨"}
                      </span>
                      <span>{nextGcEvent.title}</span>
                    </div>
                    <div className="tg_gcHeroMeta">
                      <span className="tg_gcMetaChip">
                        {pad2(nextGcEvent._d.getDate())}.{pad2(nextGcEvent._d.getMonth() + 1)} • {formatHourMinutePt(nextGcEvent._d)}
                      </span>
                      {nextGcEvent.location ? <span className="tg_gcMetaChip">{nextGcEvent.location}</span> : null}
                      {nextGcEvent.subtitle ? <span className="tg_gcMetaChip subtle">{nextGcEvent.subtitle}</span> : null}
                    </div>

                    <div className="tg_gcHeroHint">Calendário interno — mas com vibe de festival.</div>
                  </>
                ) : (
                  <div className="tg_empty">
                    <div className="tg_emptyTitle">Agenda não carregou</div>
                    <div className="tg_emptySub">Se quiser, dá pra mover isso pro config depois.</div>
                  </div>
                )}
              </div>

              <div className="tg_gcList">
                <div className="tg_gcListTitle">Programação do mês</div>
                <div className="tg_gcCards">
                  {gcEventsSorted.map((e, idx) => (
                    <div key={`${e.startISO}-${idx}`} className="tg_gcCard">
                      <div className="tg_gcIcon" aria-hidden>
                        {e.icon ?? "✨"}
                      </div>

                      <div className="tg_gcCardBody">
                        <div className="tg_gcCardTop">
                          <div className="tg_gcCardTitle">{e.title}</div>
                          <div className="tg_gcCardTime">
                            {weekdayPtShort(e._d)} • {pad2(e._d.getDate())}.{pad2(e._d.getMonth() + 1)} •{" "}
                            {formatHourMinutePt(e._d)}
                          </div>
                        </div>

                        <div className="tg_gcCardBottom">
                          {e.subtitle ? <span className="tg_gcTag">{e.subtitle}</span> : null}
                          {e.location ? <span className="tg_gcTag">{e.location}</span> : null}
                        </div>
                      </div>

                      <div className="tg_gcGlow" aria-hidden />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {activeScene === "arrivals" && (
          <section className="tg_scene">
            <div className="tg_sceneHeader">
              <h1 className="tg_title">Chegadas do mês</h1>
              <div className="tg_sceneTag">
                {monthNamePt(month0)} • nova energia no ar ✨
                {arrivalsPages.length > 1 ? <span className="tg_dimText">{` • página ${arrivalsPageIndex + 1}/${arrivalsPages.length}`}</span> : null}
              </div>
            </div>

            <div className="tg_postersRow3">
              {arrivalsShowcase.length === 0 ? (
                <div className="tg_empty">
                  <div className="tg_emptyTitle">Sem artes de chegadas no momento</div>
                  <div className="tg_emptySub">Quando tiver, elas aparecem automaticamente (via config / posters).</div>
                </div>
              ) : (
                arrivalsShowcase.slice(0, 3).map((p, idx) => (
                  <div key={`${p.src}-${idx}`} className="tg_posterFrame">
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
                    <div className="tg_emptySub">Se já subiu as artes no GitHub, essa tela passa a preencher sozinha.</div>
                  </div>
                ) : (
                  <div className="tg_birthdaysCards">
                    {birthdayShowcase.map((b, idx) => (
                      <div key={`${b.imageSrc}-${idx}`} className="tg_bdayFrame">
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
            <div className="tg_sceneHeader">
              <h1 className="tg_title">Clima</h1>
              <div className="tg_sceneTag">previsão + alertas do dia</div>
            </div>

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

                {/* EXTRAS (como você pediu) */}
                <div className="tg_weatherExtras">
                  <div className="tg_weatherExtraCard">
                    <div className="tg_weatherExtraTitle">Alertas do dia</div>
                    {weatherAlerts.length === 0 ? (
                      <div className="tg_weatherExtraEmpty">Sem alertas críticos hoje.</div>
                    ) : (
                      <div className="tg_weatherAlertsRow">
                        {weatherAlerts.map((a) => (
                          <span key={a.label} className="tg_alertChip">
                            <span className="tg_alertIcon" aria-hidden>
                              {a.icon}
                            </span>
                            <span>{a.label}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="tg_weatherExtraCard">
                    <div className="tg_weatherExtraTitle">Resumo operacional</div>
                    <div className="tg_weatherSummary">{weatherSummaryLine}</div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {activeScene === "news" && (
          <section className="tg_scene">
            <div className="tg_sceneHeader">
              <h1 className="tg_title">News</h1>
              <div className="tg_sceneTag">manchetes com imagem • leitura rápida</div>
            </div>

            {newsItems.length === 0 ? (
              <div className="tg_empty">
                <div className="tg_emptyTitle">Carregando notícias…</div>
                <div className="tg_emptySub">Agora via RSS com cache e imagem — sem depender de chave.</div>
              </div>
            ) : (
              <div className="tg_newsMasonry">
                {newsItems.map((it, idx) => (
                  <NewsTile key={`${it.title}-${idx}`} item={it} featured={idx === 0} />
                ))}
              </div>
            )}
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

function NewsTile({ item, featured }: { item: NewsItem; featured?: boolean }) {
  const domain = domainFromUrl(item.url);
  const title = normalizeText(item.title);
  const source = normalizeText(item.source ?? domain ?? "notícias");

  return (
    <article className={`tg_newsTile ${featured ? "featured" : ""}`}>
      {item.image ? (
        <img className="tg_newsTileImg" src={item.image} alt="" />
      ) : (
        <div className="tg_newsTileFallback" aria-hidden />
      )}

      <div className="tg_newsTileOverlay" />

      <div className="tg_newsTileBody">
        <div className="tg_newsTileSource">{source}</div>
        <div className="tg_newsTileTitle">{title}</div>
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
        font-family: "Montserrat", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
          Helvetica, Arial;
        background: radial-gradient(1100px 600px at 12% 18%, rgba(60, 80, 255, 0.35), transparent 55%),
          radial-gradient(900px 700px at 85% 15%, rgba(0, 220, 180, 0.26), transparent 60%),
          radial-gradient(1000px 800px at 70% 90%, rgba(255, 30, 140, 0.22), transparent 60%),
          radial-gradient(900px 700px at 15% 92%, rgba(255, 140, 30, 0.16), transparent 60%),
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

      .tg_brandLogoWrap {
        width: 44px;
        height: 44px;
        border-radius: 14px;
        display: grid;
        place-items: center;
        background: rgba(255, 255, 255, 0.07);
        border: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
        overflow: hidden;
        position: relative;
      }

      .tg_brandLogo {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .tg_brandFallback {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        font-weight: 900;
        letter-spacing: -0.06em;
        opacity: 0.9;
        pointer-events: none;
      }

      .tg_brandName {
        font-weight: 900;
        letter-spacing: -0.03em;
        font-size: 18px;
        line-height: 1.1;
      }
      .tg_brandSub {
        opacity: 0.75;
        font-size: 12px;
        font-weight: 600;
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
        display: inline-flex;
        align-items: center;
        gap: 10px;
        font-size: 12px;
        letter-spacing: 0.14em;
        opacity: 0.95;
        padding: 8px 14px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(0, 0, 0, 0.12);
        text-transform: uppercase;
        font-weight: 800;
      }

      .tg_tabLogo {
        height: 16px;
        width: auto;
        display: block;
        filter: drop-shadow(0 10px 16px rgba(0, 0, 0, 0.45));
      }

      .tg_tabText {
        display: none; /* com logo fica mais clean; se quiser texto, troca pra inline */
      }

      .tg_clock {
        text-align: right;
        min-width: 260px;
      }
      .tg_time {
        font-weight: 950;
        font-size: 56px;
        letter-spacing: -0.06em;
        line-height: 0.95;
      }
      .tg_date {
        opacity: 0.8;
        font-size: 14px;
        margin-top: 6px;
        font-weight: 600;
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
        font-weight: 700;
        text-transform: lowercase;
      }
      .tg_dimText {
        opacity: 0.75;
        font-weight: 700;
      }

      .tg_title {
        font-weight: 950;
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
        font-weight: 600;
      }
      .dot {
        opacity: 0.6;
      }

      /* WELCOME: MVV */
      .tg_mvvGrid {
        display: grid;
        grid-template-columns: 1.1fr 1fr 1fr;
        gap: 16px;
        margin-top: 18px;
      }

      .tg_mvvCard {
        position: relative;
        border-radius: 26px;
        padding: 22px 22px 18px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        overflow: hidden;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
        min-height: 280px;
      }

      .tg_mvvCard::before {
        content: "";
        position: absolute;
        inset: -40%;
        filter: blur(40px);
        opacity: 0.9;
        pointer-events: none;
      }

      .tg_mvvCard.mission {
        background: rgba(0, 0, 0, 0.16);
      }
      .tg_mvvCard.mission::before {
        background: radial-gradient(circle at 20% 30%, rgba(255, 40, 160, 0.45), transparent 55%),
          radial-gradient(circle at 70% 60%, rgba(120, 90, 255, 0.35), transparent 55%);
      }

      .tg_mvvCard.vision {
        background: rgba(0, 0, 0, 0.16);
      }
      .tg_mvvCard.vision::before {
        background: radial-gradient(circle at 25% 25%, rgba(60, 140, 255, 0.45), transparent 55%),
          radial-gradient(circle at 75% 70%, rgba(0, 220, 180, 0.28), transparent 55%);
      }

      .tg_mvvCard.values {
        background: rgba(0, 0, 0, 0.16);
      }
      .tg_mvvCard.values::before {
        background: radial-gradient(circle at 20% 25%, rgba(80, 255, 160, 0.32), transparent 55%),
          radial-gradient(circle at 80% 70%, rgba(255, 180, 40, 0.22), transparent 55%);
      }

      .tg_mvvTop {
        position: relative;
        z-index: 2;
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 14px;
      }

      .tg_mvvPill {
        padding: 8px 12px;
        border-radius: 999px;
        font-size: 12px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        border: 1px solid rgba(255, 255, 255, 0.10);
        background: rgba(0, 0, 0, 0.18);
        font-weight: 900;
      }

      .tg_mvvBig {
        position: relative;
        z-index: 2;
        font-size: 30px;
        line-height: 1.06;
        font-weight: 950;
        letter-spacing: -0.03em;
        text-shadow: 0 18px 45px rgba(0, 0, 0, 0.45);
      }

      .tg_mvvMini {
        position: relative;
        z-index: 2;
        margin-top: 14px;
        font-size: 12px;
        opacity: 0.85;
        font-weight: 700;
      }

      .tg_valuesList {
        position: relative;
        z-index: 2;
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 10px;
      }

      .tg_valueItem {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        font-size: 14px;
        opacity: 0.95;
        font-weight: 700;
      }

      .tg_check {
        width: 20px;
        height: 20px;
        border-radius: 8px;
        display: grid;
        place-items: center;
        background: rgba(255, 255, 255, 0.10);
        border: 1px solid rgba(255, 255, 255, 0.12);
        flex: 0 0 20px;
        margin-top: 1px;
      }

      .tg_welcomeBottom {
        margin-top: 14px;
        opacity: 0.82;
        font-size: 13px;
        font-weight: 700;
      }

      /* ARRIVALS: 3 col */
      .tg_postersRow3 {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
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
        padding: 16px;
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
        font-weight: 800;
      }

      /* Birthdays */
      .tg_birthdaysGrid {
        display: grid;
        grid-template-columns: 1.2fr 0.8fr;
        gap: 16px;
        margin-top: 14px;
      }
      .tg_birthdaysShowcase,
      .tg_birthdaysList {
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
        font-weight: 700;
      }
      .tg_listTitle {
        font-weight: 900;
        letter-spacing: -0.02em;
        margin-bottom: 10px;
      }
      .tg_listEmpty {
        opacity: 0.7;
        font-size: 13px;
        font-weight: 700;
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
        font-weight: 700;
      }
      .tg_listDim {
        opacity: 0.75;
        font-weight: 700;
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
        font-weight: 950;
        font-size: 54px;
        letter-spacing: -0.06em;
        line-height: 0.95;
      }
      .tg_weatherDesc {
        opacity: 0.82;
        font-size: 14px;
        margin-top: 6px;
        font-weight: 700;
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
        font-weight: 800;
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
        font-weight: 950;
        font-size: 18px;
      }

      .tg_weatherExtras {
        margin-top: 12px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .tg_weatherExtraCard {
        border-radius: 18px;
        border: 1px solid rgba(255, 255, 255, 0.10);
        background: rgba(0, 0, 0, 0.18);
        padding: 14px;
      }
      .tg_weatherExtraTitle {
        font-weight: 900;
        margin-bottom: 10px;
        opacity: 0.95;
      }
      .tg_weatherExtraEmpty {
        opacity: 0.78;
        font-size: 13px;
        font-weight: 700;
      }
      .tg_weatherAlertsRow {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }
      .tg_alertChip {
        display: inline-flex;
        gap: 10px;
        align-items: center;
        padding: 10px 12px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.10);
        background: rgba(255, 255, 255, 0.05);
        font-weight: 800;
        font-size: 12px;
      }
      .tg_alertIcon {
        font-size: 16px;
      }
      .tg_weatherSummary {
        font-weight: 800;
        font-size: 14px;
        opacity: 0.95;
      }

      /* NEWS (image-first) */
      .tg_newsMasonry {
        margin-top: 14px;
        display: grid;
        grid-template-columns: 1.2fr 1fr 1fr;
        gap: 14px;
        grid-auto-rows: 160px;
      }

      .tg_newsTile {
        position: relative;
        border-radius: 22px;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(0, 0, 0, 0.18);
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
      }

      .tg_newsTile.featured {
        grid-row: span 2;
        grid-column: span 1;
      }

      .tg_newsTileImg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        filter: saturate(1.05) contrast(1.05);
        transform: scale(1.02);
      }

      .tg_newsTileFallback {
        position: absolute;
        inset: 0;
        background: radial-gradient(circle at 30% 30%, rgba(60, 140, 255, 0.35), transparent 60%),
          radial-gradient(circle at 70% 75%, rgba(255, 40, 160, 0.22), transparent 60%),
          rgba(0, 0, 0, 0.15);
      }

      .tg_newsTileOverlay {
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg, rgba(0, 0, 0, 0.05), rgba(0, 0, 0, 0.70));
      }

      .tg_newsTileBody {
        position: absolute;
        left: 14px;
        right: 14px;
        bottom: 14px;
        display: grid;
        gap: 8px;
      }

      .tg_newsTileSource {
        display: inline-flex;
        width: fit-content;
        padding: 8px 10px;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.35);
        border: 1px solid rgba(255, 255, 255, 0.12);
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-weight: 900;
      }

      .tg_newsTileTitle {
        font-weight: 950;
        letter-spacing: -0.02em;
        font-size: 16px;
        line-height: 1.12;
        text-shadow: 0 18px 45px rgba(0, 0, 0, 0.55);
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .tg_newsTile.featured .tg_newsTileTitle {
        font-size: 22px;
        -webkit-line-clamp: 4;
      }

      /* GC */
      .tg_gcGrid {
        margin-top: 16px;
        display: grid;
        grid-template-columns: 1fr 1.2fr;
        gap: 16px;
        align-items: stretch;
      }

      .tg_gcHero {
        border-radius: 26px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(0, 0, 0, 0.16);
        padding: 18px;
        position: relative;
        overflow: hidden;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
      }

      .tg_gcHero::before {
        content: "";
        position: absolute;
        inset: -40%;
        filter: blur(40px);
        opacity: 0.95;
        background: radial-gradient(circle at 20% 30%, rgba(255, 40, 160, 0.35), transparent 55%),
          radial-gradient(circle at 70% 40%, rgba(60, 140, 255, 0.32), transparent 55%),
          radial-gradient(circle at 60% 85%, rgba(0, 220, 180, 0.22), transparent 55%);
        pointer-events: none;
      }

      .tg_gcHeroTop {
        position: relative;
        z-index: 2;
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 14px;
      }

      .tg_gcPill {
        padding: 8px 12px;
        border-radius: 999px;
        font-size: 12px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        border: 1px solid rgba(255, 255, 255, 0.10);
        background: rgba(0, 0, 0, 0.18);
        font-weight: 900;
      }

      .tg_gcMonth {
        font-weight: 900;
        opacity: 0.9;
      }

      .tg_gcHeroTitle {
        position: relative;
        z-index: 2;
        display: flex;
        align-items: center;
        gap: 12px;
        font-weight: 950;
        letter-spacing: -0.03em;
        font-size: 30px;
        line-height: 1.05;
        margin-bottom: 12px;
      }

      .tg_gcHeroIcon {
        width: 44px;
        height: 44px;
        border-radius: 16px;
        display: grid;
        place-items: center;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.12);
        font-size: 22px;
      }

      .tg_gcHeroMeta {
        position: relative;
        z-index: 2;
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 14px;
      }

      .tg_gcMetaChip {
        padding: 10px 12px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.10);
        background: rgba(0, 0, 0, 0.18);
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 0.02em;
      }
      .tg_gcMetaChip.subtle {
        opacity: 0.88;
        font-weight: 800;
      }

      .tg_gcHeroHint {
        position: relative;
        z-index: 2;
        opacity: 0.82;
        font-size: 13px;
        font-weight: 700;
      }

      .tg_gcList {
        border-radius: 26px;
        border: 1px solid rgba(255, 255, 255, 0.10);
        background: rgba(255, 255, 255, 0.03);
        padding: 16px;
      }

      .tg_gcListTitle {
        font-weight: 950;
        letter-spacing: -0.03em;
        font-size: 18px;
        margin-bottom: 12px;
      }

      .tg_gcCards {
        display: grid;
        gap: 12px;
      }

      .tg_gcCard {
        position: relative;
        display: grid;
        grid-template-columns: 56px 1fr;
        gap: 12px;
        align-items: center;
        padding: 14px;
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.10);
        background: rgba(0, 0, 0, 0.16);
        overflow: hidden;
      }

      .tg_gcIcon {
        width: 56px;
        height: 56px;
        border-radius: 18px;
        display: grid;
        place-items: center;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.12);
        font-size: 24px;
      }

      .tg_gcCardBody {
        min-width: 0;
        display: grid;
        gap: 8px;
      }

      .tg_gcCardTop {
        display: grid;
        gap: 4px;
      }

      .tg_gcCardTitle {
        font-weight: 950;
        letter-spacing: -0.02em;
        font-size: 16px;
        line-height: 1.1;
      }

      .tg_gcCardTime {
        opacity: 0.82;
        font-size: 12px;
        font-weight: 800;
        text-transform: lowercase;
      }

      .tg_gcCardBottom {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .tg_gcTag {
        padding: 8px 10px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.10);
        background: rgba(255, 255, 255, 0.04);
        font-size: 12px;
        font-weight: 800;
        opacity: 0.95;
      }

      .tg_gcGlow {
        position: absolute;
        inset: -50%;
        background: radial-gradient(circle at 25% 30%, rgba(255, 40, 160, 0.18), transparent 55%),
          radial-gradient(circle at 70% 70%, rgba(60, 140, 255, 0.16), transparent 55%);
        filter: blur(50px);
        opacity: 0.9;
        pointer-events: none;
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
        font-weight: 800;
      }

      .sep {
        margin-left: 12px;
        opacity: 0.55;
      }

      @keyframes tgMarquee {
        from {
          transform: translateX(0);
        }
        to {
          transform: translateX(-50%);
        }
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

      /* MusicDock */
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
        margin-top: 16px;
        height: 60vh;
        border-radius: 22px;
        border: 1px solid rgba(255, 255, 255, 0.10);
        background: rgba(255, 255, 255, 0.03);
        display: grid;
        place-items: center;
        padding: 22px;
        text-align: center;
      }
      .tg_emptyTitle {
        font-weight: 950;
        letter-spacing: -0.03em;
        font-size: 18px;
        margin-bottom: 6px;
      }
      .tg_emptySub {
        opacity: 0.75;
        font-size: 13px;
        max-width: 520px;
        font-weight: 700;
      }

      /* TV mode */
      .tg_root.tv .tg_time {
        font-size: 54px;
      }
      .tg_root.tv .tg_title {
        font-size: 46px;
      }
      .tg_root.tv .tg_mvvBig {
        font-size: 26px;
      }
      .tg_root.tv .tg_scene {
        padding: 26px;
      }
      .tg_root.tv .tg_postersRow3 {
        gap: 14px;
      }
    `}</style>
  );
}
