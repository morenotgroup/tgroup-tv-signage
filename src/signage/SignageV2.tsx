"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SIGNAGE_CONFIG } from "@/config";
import MusicDock from "@/components/MusicDock";

type SceneId =
  | "welcome"
  | "agenda"
  | "arrivals"
  | "arrivals2"
  | "birthdays"
  | "weather"
  | "news";

type WeatherHourly = {
  timeLabel: string; // "13:00"
  tempC?: number;
  emoji?: string;
  description?: string;
  popPct?: number; // prob. precipitação
  windKmh?: number;
  uvIndex?: number;
};

type WeatherDaily = {
  dayLabel: string; // "seg"
  minC?: number;
  maxC?: number;
  emoji?: string;
  description?: string;
  popPct?: number;
  uvMax?: number;
};

type WeatherAlert = {
  label: string;
  kind: "rain" | "uv" | "wind";
};

type WeatherPayload = {
  ok: boolean;
  tempC?: number;
  emoji?: string;
  description?: string;

  // extras (pra preencher a tela)
  humidityPct?: number;
  windKmh?: number;
  windGustKmh?: number;
  popNowPct?: number;
  uvNow?: number;
  sunriseHHMM?: string;
  sunsetHHMM?: string;

  alerts?: WeatherAlert[];
  summaryLine?: string;

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

type AgendaEvent = {
  id: string;
  title: string;
  subtitle?: string;
  dateISO: string; // "2026-02-26"
  timeHHMM: string; // "18:30"
  location?: string; // "Sede" | "Playball"
  icon: "volley" | "coffee" | "cake" | "cheers" | "people" | "ball";
  chips?: string[];
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

function domainFromUrl(url?: string) {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function googleFavicon(domain?: string) {
  if (!domain) return undefined;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

/** decodifica entidades HTML e tenta corrigir “mojibake” comum (acentos quebrados) */
function decodeHtmlEntities(input: string) {
  const s = input ?? "";
  // básico sem DOM (funciona no client)
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function fixMojibake(input: string) {
  const s = input ?? "";
  // se aparecer “Ã”, “Â” etc, geralmente é UTF-8 lido como latin1
  if (!/[ÃÂ]/.test(s)) return s;
  try {
    // eslint-disable-next-line no-undef
    return decodeURIComponent(escape(s));
  } catch {
    return s;
  }
}

function normalizeText(input?: string) {
  if (!input) return "";
  let s = input;
  s = decodeHtmlEntities(s);
  s = fixMojibake(s);
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function useTvMode() {
  const params = useSearchParams();
  const tv = params?.get("tv") === "1";
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

function parseLocalDateTime(dateISO: string, timeHHMM: string) {
  // assume timezone local do device (TV), que pra você é SP
  const [y, m, d] = dateISO.split("-").map((x) => Number(x));
  const [hh, mm] = timeHHMM.split(":").map((x) => Number(x));
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0);
}

function formatAgendaWhen(d: Date) {
  const wd = d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "").toLowerCase();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${wd} • ${dd}.${mm} • ${hh}:${mi}`;
}

function TabLogo({
  label,
  tv,
}: {
  label: string;
  tv: boolean;
}) {
  const key = (label ?? "").toLowerCase();
  const candidates = useMemo(() => {
    // você tem duplicados — tentamos os “clean” primeiro e caímos pro “logo-”
    if (key.includes("brands")) return ["/signage/logos/tbrands.png", "/signage/logos/logo-tbrands.png", "/signage/logos/tbrands.svg"];
    if (key.includes("venues")) return ["/signage/logos/tvenues.png", "/signage/logos/logo-tvenues.png", "/signage/logos/tvenues.svg"];
    if (key.includes("dreams")) return ["/signage/logos/tdreams.png", "/signage/logos/logo-tdreams.png", "/signage/logos/tdreams.svg"];
    if (key.includes("youth")) return ["/signage/logos/tyouth.png", "/signage/logos/logo-tyouth.png", "/signage/logos/tyouth.svg"];
    return [];
  }, [key]);

  const [srcIndex, setSrcIndex] = useState(0);
  const src = candidates[srcIndex];

  if (!src) return <span className="tg_tabText">{label}</span>;

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="tg_tabLogo"
        src={src}
        alt={label}
        onError={() => setSrcIndex((i) => Math.min(i + 1, candidates.length - 1))}
      />
      <span className="tg_srOnly">{label}</span>
    </>
  );
}

export default function SignageV2() {
  const cfg = SIGNAGE_CONFIG as any;

  const tv = useTvMode();
  const now = useClock(1000);

  // Tempo de cada tela (padrão 11s) — com clamps
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

  // Data
  const [weather, setWeather] = useState<WeatherPayload | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [birthdays, setBirthdays] = useState<BirthdayItem[]>([]);
  const [arrivals, setArrivals] = useState<Array<{ src: string; label?: string }>>(
    () => cfg?.welcomePosters ?? cfg?.arrivalsPosters ?? []
  );

  // Agenda GC (pode vir do config; se não vier, usa o fallback que você passou)
  const agendaEvents: AgendaEvent[] = useMemo(() => {
    const fromCfg = cfg?.gcAgendaEvents;
    if (Array.isArray(fromCfg) && fromCfg.length) return fromCfg;

    return [
      {
        id: "esportes-0224",
        title: "Esportes T.Group",
        subtitle: "Vôlei de Areia",
        dateISO: "2026-02-24",
        timeHHMM: "20:00",
        location: "Playball",
        icon: "volley",
        chips: ["Vôlei de areia", "Playball"],
      },
      {
        id: "cafe-0226-1700",
        title: "Café com T",
        subtitle: "Conexão + updates",
        dateISO: "2026-02-26",
        timeHHMM: "17:00",
        location: "Sede",
        icon: "coffee",
        chips: ["Conexão", "Updates", "Sede"],
      },
      {
        id: "bday-0226-1820",
        title: "Parabéns do mês",
        subtitle: "Aniversariantes de fevereiro",
        dateISO: "2026-02-26",
        timeHHMM: "18:20",
        location: "Sede",
        icon: "cake",
        chips: ["Aniversário", "Fevereiro", "Sede"],
      },
      {
        id: "hh-0226-1830",
        title: "Happy Hour T.Group",
        subtitle: "Fechamento do dia com a galera",
        dateISO: "2026-02-26",
        timeHHMM: "18:30",
        location: "Sede",
        icon: "cheers",
        chips: ["Happy Hour", "Sede"],
      },
    ] as AgendaEvent[];
  }, [cfg?.gcAgendaEvents]);

  // Cenas (ordem sugerida)
  const scenes: SceneId[] = useMemo(() => {
    // welcome -> agenda -> arrivals -> birthdays -> weather -> news
    const base: SceneId[] = ["welcome", "agenda", "arrivals", "birthdays", "weather", "news"];
    // se tiver 5+ chegadas, habilita uma “segunda tela”
    if (arrivals.length > 4) {
      const idx = base.indexOf("arrivals");
      if (idx >= 0) base.splice(idx + 1, 0, "arrivals2");
    }
    return base;
  }, [arrivals.length]);

  const [sceneIndex, setSceneIndex] = useState(0);
  const activeScene = scenes[sceneIndex] ?? "welcome";

  // se mudar número de cenas, garante índice válido
  useEffect(() => {
    setSceneIndex((i) => (i >= scenes.length ? 0 : i));
  }, [scenes.length]);

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

  // Fetch News
  useEffect(() => {
    let alive = true;

    function normalizeNewsPayload(payload: any): NewsItem[] {
      const items = payload?.items ?? payload?.news ?? payload?.data ?? payload ?? [];
      if (!Array.isArray(items)) return [];

      return items
        .map((it: any) => {
          if (typeof it === "string") return { title: normalizeText(it) } as NewsItem;
          const titleRaw = it?.title ?? it?.headline ?? it?.name ?? "";
          const title = normalizeText(titleRaw);
          if (!title) return null;
          return {
            title,
            source: normalizeText(it?.source ?? it?.provider ?? it?.site ?? it?.origin ?? ""),
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

  // Header data
  const timeHHMM = useMemo(
    () => now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    [now]
  );
  const dateLong = useMemo(() => formatDateLongPt(now), [now]);

  const locationLabel = useMemo(() => cfg?.locationLabel ?? "Perdizes - São Paulo", [cfg?.locationLabel]);

  const tempNowLabel = useMemo(() => {
    const t = weather?.tempC;
    if (!Number.isFinite(Number(t))) return undefined;
    return `${Math.round(Number(t))}°C`;
  }, [weather?.tempC]);

  // Birthdays do mês atual
  const month0 = now.getMonth(); // 0..11
  const month1 = month0 + 1; // 1..12
  const birthdaysThisMonth = useMemo(() => {
    const filtered = birthdays.filter((b) => b.month === month1 || (!b.month && b.mmdd?.startsWith(pad2(month1))));
    const sorted = [...filtered].sort((a, b) => {
      const na = (a.name ?? "").toLocaleLowerCase("pt-BR");
      const nb = (b.name ?? "").toLocaleLowerCase("pt-BR");
      return na.localeCompare(nb, "pt-BR");
    });
    return sorted;
  }, [birthdays, month1]);

  // Duas artes “rodando” na tela (aniversários)
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

  // About texts (mantém pegada)
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
    const tagline = cfg?.tagline ?? "Sinta-se em casa. A gente cuida do resto.";
    return { mission, vision, values, tagline };
  }, [cfg?.mission, cfg?.vision, cfg?.values, cfg?.tagline]);

  // Tabs (labels)
  const tabs = useMemo(() => {
    const raw = cfg?.brandTabs;
    if (Array.isArray(raw) && raw.length) {
      return raw.map((t: any) => (typeof t === "string" ? t : t?.label ?? t?.name ?? "")).filter(Boolean);
    }
    return ["BRANDS", "VENUES", "DREAMS", "YOUTH"];
  }, [cfg?.brandTabs]);

  // Logos
  const logoTGroup = useMemo(() => cfg?.logoTGroup ?? "/signage/logos/tgroup-logo.png", [cfg?.logoTGroup]);

  // Ticker (usa news, normalizado)
  const tickerItems = useMemo(() => {
    const base = news.slice(0, 12).map((n) => normalizeText(n.title)).filter(Boolean);
    if (base.length === 0) return ["T.Group • Recepção • Bem-vindas, vindes e vindos"];
    return base;
  }, [news]);

  // Agenda: próximo evento e lista ordenada
  const agendaSorted = useMemo(() => {
    const list = [...agendaEvents];
    list.sort((a, b) => {
      const da = parseLocalDateTime(a.dateISO, a.timeHHMM).getTime();
      const db = parseLocalDateTime(b.dateISO, b.timeHHMM).getTime();
      return da - db;
    });
    return list;
  }, [agendaEvents]);

  const agendaNext = useMemo(() => {
    const nowTs = now.getTime();
    const future = agendaSorted.find((ev) => parseLocalDateTime(ev.dateISO, ev.timeHHMM).getTime() >= nowTs - 10 * 60_000);
    return future ?? agendaSorted[0];
  }, [agendaSorted, now]);

  return (
    <div className={`tg_root ${tv ? "tv" : ""}`} data-scene={activeScene}>
      {/* Header */}
      <header className="tg_header">
        <div className="tg_brand">
          <div className="tg_mark" aria-label="T.Group">
            {/* IMPORTANTE: tiramos o “T.” pra não ficar por trás do logo */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="tg_markImg" src={logoTGroup} alt="T.Group" />
          </div>
          <div className="tg_brandText">
            <div className="tg_brandName">T.Group</div>
            <div className="tg_brandSub">TV Signage • Sede • Perdizes</div>
          </div>
        </div>

        <nav className="tg_tabs" aria-label="Empresas">
          {tabs.map((t: string) => (
            <span key={t} className="tg_tab" aria-label={t}>
              <TabLogo label={t} tv={tv} />
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
            <div className="tg_sceneTop">
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
            </div>

            {/* Layout que você curtiu: Missão, Visão, Valores — agora preenchendo melhor a TV */}
            <div className="tg_welcomeCard">
  <div className="tg_aboutWrap tg_aboutWrapSolo">
    <div className="tg_aboutHeader">
      <span className="tg_pill">SOBRE A GENTE</span>
      <span className="tg_aboutHint">entretenimento • live marketing • performance • tecnologia</span>
    </div>

    <div className="tg_aboutCards">
      <div className="tg_aboutCard mission">
        <div className="tg_aboutLabel">Missão</div>
        <div className="tg_aboutText">{about.mission}</div>
        <div className="tg_aboutMini">Do briefing ao aplauso — com execução impecável.</div>
      </div>

      <div className="tg_aboutCard vision">
        <div className="tg_aboutLabel">Visão</div>
        <div className="tg_aboutText">{about.vision}</div>
        <div className="tg_aboutMini">Performance real + tecnologia, sem perder o brilho.</div>
      </div>

      <div className="tg_aboutCard values">
        <div className="tg_aboutLabel">Valores</div>
        <ul className="tg_values">
          {about.values.map((v: string) => (
            <li key={v} className="tg_value">
              <span className="check" aria-hidden>✓</span>
              <span>{v}</span>
            </li>
          ))}
        </ul>
        <div className="tg_aboutMini">Cultura aqui não é frase bonita — é operação.</div>
      </div>
    </div>

    <div className="tg_welcomeFooter">
      <span className="tg_mini">{about.tagline}</span>
    </div>
  </div>
</div>

                <div className="tg_welcomeFooter">
                  <span className="tg_mini">{about.tagline}</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {activeScene === "agenda" && (
          <section className="tg_scene">
            <div className="tg_sceneTop">
              <h1 className="tg_title">Agenda GC</h1>
              <div className="tg_kicker">
                <span>{monthNamePt(month0)}</span>
                <span className="dot">•</span>
                <span>o que rola com a galera</span>
              </div>
            </div>

            <div className="tg_agendaGrid">
              {/* LEFT: Próximo (menor e mais “visual”) */}
              <div className="tg_agendaNext">
                <div className="tg_agendaNextHeader">
                  <span className="tg_pill">PRÓXIMO</span>
                  <span className="tg_agendaMonth">{monthNamePt(month0)}</span>
                </div>

                {agendaNext ? (
                  <div className="tg_agendaNextCard">
                    <div className="tg_agendaNextIcon" aria-hidden>
                      <AgendaIcon kind={agendaNext.icon} />
                    </div>

                    <div className="tg_agendaNextBody">
                      <div className="tg_agendaNextTitle">{agendaNext.title}</div>
                      {agendaNext.subtitle ? <div className="tg_agendaNextSub">{agendaNext.subtitle}</div> : null}

                      <div className="tg_agendaNextMeta">
                        <span className="tg_chipSm">{formatAgendaWhen(parseLocalDateTime(agendaNext.dateISO, agendaNext.timeHHMM))}</span>
                        {agendaNext.location ? <span className="tg_chipSm">{agendaNext.location}</span> : null}
                      </div>

                      {Array.isArray(agendaNext.chips) && agendaNext.chips.length ? (
                        <div className="tg_agendaChips">
                          {agendaNext.chips.slice(0, 3).map((c) => (
                            <span key={c} className="tg_chipTiny">
                              {c}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    {/* decoração vetorial (sem poluir) */}
                    <div className="tg_agendaDeco" aria-hidden>
                      <AgendaIcon kind="people" />
                    </div>
                  </div>
                ) : (
                  <div className="tg_empty">
                    <div className="tg_emptyTitle">Agenda vazia</div>
                    <div className="tg_emptySub">Suba os eventos do mês e essa tela fica linda automaticamente.</div>
                  </div>
                )}

                <div className="tg_agendaFooterNote">Calendário interno — mas com vibe de festival.</div>
              </div>

              {/* RIGHT: Programação do mês */}
              <div className="tg_agendaList">
                <div className="tg_listTitle">Programação do mês</div>

                <div className="tg_agendaListItems">
                  {agendaSorted.slice(0, 6).map((ev) => {
                    const dt = parseLocalDateTime(ev.dateISO, ev.timeHHMM);
                    return (
                      <div key={ev.id} className="tg_agendaItem">
                        <div className="tg_agendaItemIcon" aria-hidden>
                          <AgendaIcon kind={ev.icon} />
                        </div>

                        <div className="tg_agendaItemBody">
                          <div className="tg_agendaItemTop">
                            <div className="tg_agendaItemTitle">{ev.title}</div>
                            <div className="tg_agendaItemWhen">{formatAgendaWhen(dt)}</div>
                          </div>

                          <div className="tg_agendaItemBottom">
                            {ev.subtitle ? <span className="tg_agendaItemSub">{ev.subtitle}</span> : null}
                            <span className="tg_dotSm">•</span>
                            <span className="tg_agendaItemLoc">{ev.location ?? "Sede"}</span>

                            {Array.isArray(ev.chips) && ev.chips.length ? (
                              <>
                                <span className="tg_dotSm">•</span>
                                <span className="tg_agendaItemChips">
                                  {ev.chips.slice(0, 3).join(" • ")}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="tg_agendaSideDeco" aria-hidden>
                  <AgendaIcon kind="ball" />
                  <AgendaIcon kind="coffee" />
                  <AgendaIcon kind="cake" />
                  <AgendaIcon kind="cheers" />
                </div>
              </div>
            </div>
          </section>
        )}

        {activeScene === "arrivals" && (
          <section className="tg_scene">
            <div className="tg_sceneTop">
              <h1 className="tg_title">Chegadas do mês</h1>
              <div className="tg_kicker">
                <span>{monthNamePt(month0)}</span>
                <span className="dot">•</span>
                <span>nova energia no ar ✨</span>
              </div>
            </div>

            <div className="tg_postersRow3">
              {arrivals.length === 0 ? (
                <div className="tg_empty">
                  <div className="tg_emptyTitle">Sem artes de chegadas no momento</div>
                  <div className="tg_emptySub">Quando tiver, elas aparecem automaticamente (via config / posters).</div>
                </div>
              ) : (
                arrivals.slice(0, 3).map((p, idx) => (
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

        {activeScene === "arrivals2" && (
          <section className="tg_scene">
            <div className="tg_sceneTop">
              <h1 className="tg_title">Chegadas do mês</h1>
              <div className="tg_kicker">
                <span>{monthNamePt(month0)}</span>
                <span className="dot">•</span>
                <span>mais chegadas por aqui ✨</span>
              </div>
            </div>

            <div className="tg_postersRow3">
              {arrivals.length <= 3 ? (
                <div className="tg_empty">
                  <div className="tg_emptyTitle">Sem segunda tela este mês</div>
                  <div className="tg_emptySub">Se subirem 5+ artes no mês, essa tela entra automaticamente.</div>
                </div>
              ) : (
                arrivals.slice(3, 6).map((p, idx) => (
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
            <div className="tg_sceneTop">
              <h1 className="tg_title">{`Aniversários de ${monthNamePt(month0)}`}</h1>
              <div className="tg_kicker">
                <span>mês em destaque</span>
                <span className="dot">•</span>
                <span>todo mundo lembra, todo mundo comemora 🎉</span>
              </div>
            </div>

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
            <div className="tg_sceneTop">
              <h1 className="tg_title">Clima</h1>
              <div className="tg_kicker">
                <span>previsão + alertas do dia</span>
              </div>
            </div>

            <div className="tg_weatherGridV2">
              <div className="tg_weatherNowV2">
                <div className="tg_weatherBig">
                  <div className="tg_weatherEmoji" aria-hidden>
                    {weather?.emoji ?? "⛅️"}
                  </div>
                  <div>
                    <div className="tg_weatherTemp">{tempNowLabel ?? "—"}</div>
                    <div className="tg_weatherDesc">{weather?.description ?? "São Paulo"}</div>
                    <div className="tg_weatherMiniRow">
                      {Number.isFinite(Number(weather?.humidityPct)) ? (
                        <span className="tg_chipTiny">Umidade {Math.round(Number(weather?.humidityPct))}%</span>
                      ) : null}
                      {Number.isFinite(Number(weather?.windKmh)) ? (
                        <span className="tg_chipTiny">Vento {Math.round(Number(weather?.windKmh))} km/h</span>
                      ) : null}
                      {Number.isFinite(Number(weather?.uvNow)) ? (
                        <span className="tg_chipTiny">UV {Math.round(Number(weather?.uvNow))}</span>
                      ) : null}
                      {weather?.sunsetHHMM ? <span className="tg_chipTiny">Pôr do sol {weather.sunsetHHMM}</span> : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="tg_weatherNextV2">
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
                      {Number.isFinite(Number(d.popPct)) ? (
                        <div className="tg_dayMini">{`Chuva ${Math.round(Number(d.popPct))}%`}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              <div className="tg_weatherHourlyV2">
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
                      {Number.isFinite(Number(h.popPct)) ? <div className="tg_hourMini">{`${Math.round(Number(h.popPct))}%`}</div> : null}
                    </div>
                  ))}
                </div>
              </div>

              {/* BLOCO EXTRA: Alertas + Resumo operacional */}
              <div className="tg_weatherAlerts">
                <div className="tg_panelTitle">Alertas do dia</div>
                <div className="tg_alertRow">
                  {(weather?.alerts ?? []).length ? (
                    (weather?.alerts ?? []).slice(0, 4).map((a, idx) => (
                      <span key={`${a.kind}-${idx}`} className={`tg_alertPill ${a.kind}`}>
                        <span className="tg_alertDot" aria-hidden />
                        <span>{a.label}</span>
                      </span>
                    ))
                  ) : (
                    <span className="tg_dim">Sem alertas relevantes no momento.</span>
                  )}
                </div>
              </div>

              <div className="tg_weatherSummary">
                <div className="tg_panelTitle">Resumo operacional</div>
                <div className="tg_summaryLine">
                  {weather?.summaryLine ?? "Hoje: —"}
                </div>
              </div>
            </div>
          </section>
        )}

        {activeScene === "news" && (
          <section className="tg_scene">
            <div className="tg_sceneTop">
              <h1 className="tg_title">News</h1>
              {/* removi as “dicas pequenas” aqui */}
            </div>

            <div className="tg_newsGridV2 tg_newsGridUniform">
  {(news.length ? news.slice(0, 6) : Array.from({ length: 6 }).map(() => null)).map((it, idx) =>
    it ? (
      <NewsCardV2 key={`${it.title}-${idx}`} item={it} />
    ) : (
      <div key={`sk-${idx}`} className="tg_newsCardV2 skeleton">
        <div className="tg_skeletonTitle">Carregando notícias…</div>
        <div className="tg_skeletonSub">aguenta só um segundo</div>
      </div>
    )
  )}
</div>

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

function NewsCardV2({ item, featured, compact }: { item: NewsItem; featured?: boolean; compact?: boolean }) {
  const domain = domainFromUrl(item.url);
  const favicon = googleFavicon(domain);
  const title = normalizeText(item.title);

  const mediaSrc = item.image || favicon;

  return (
    <article className={`tg_newsCardV2 ${featured ? "featured" : ""} ${compact ? "compact" : ""}`}>
      <div className="tg_newsBg">
        {mediaSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="tg_newsBgImg" src={mediaSrc} alt="" />
        ) : null}
        <div className="tg_newsBgShade" />
      </div>

      <div className="tg_newsOverlay">
        <div className="tg_newsPill">
          <span className="tg_newsPillDot" aria-hidden />
          <span className="tg_newsPillText">{item.source ?? domain ?? "notícias"}</span>
        </div>

        <div className="tg_newsTitleV2">{title}</div>

        <div className="tg_newsMetaV2">
          {domain ? <span className="tg_newsDomainV2">{domain}</span> : <span className="tg_newsDomainV2">Brasil</span>}
        </div>
      </div>
    </article>
  );
}

/** Ícones vetoriais simples, leves e bonitos (sem dependência externa) */
function AgendaIcon({ kind }: { kind: AgendaEvent["icon"] }) {
  const common = {
    width: 26,
    height: 26,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
  } as any;

  switch (kind) {
    case "volley":
      return (
        <svg {...common}>
          <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="1.6" opacity="0.9"/>
          <path d="M3.5 10.5c3.5 0 6.5 2 8.5 5.5" stroke="currentColor" strokeWidth="1.6" opacity="0.8"/>
          <path d="M20.5 13.5c-3.8.2-7.3-1.2-10-4.2" stroke="currentColor" strokeWidth="1.6" opacity="0.8"/>
          <path d="M9 3.8c.6 3.5 3 6.4 6.8 7.8" stroke="currentColor" strokeWidth="1.6" opacity="0.8"/>
        </svg>
      );
    case "coffee":
      return (
        <svg {...common}>
          <path d="M6 8h10v5a5 5 0 0 1-10 0V8Z" stroke="currentColor" strokeWidth="1.6" opacity="0.9"/>
          <path d="M16 9h1.5A2.5 2.5 0 0 1 20 11.5 2.5 2.5 0 0 1 17.5 14H16" stroke="currentColor" strokeWidth="1.6" opacity="0.9"/>
          <path d="M7 20h8" stroke="currentColor" strokeWidth="1.6" opacity="0.7"/>
          <path d="M9 5c0 1 .8 1.3.8 2.2S9 8.6 9 9" stroke="currentColor" strokeWidth="1.6" opacity="0.6"/>
          <path d="M12 5c0 1 .8 1.3.8 2.2S12 8.6 12 9" stroke="currentColor" strokeWidth="1.6" opacity="0.6"/>
        </svg>
      );
    case "cake":
      return (
        <svg {...common}>
          <path d="M7 10h10v3a5 5 0 0 1-10 0v-3Z" stroke="currentColor" strokeWidth="1.6" opacity="0.9"/>
          <path d="M6 13h12v5H6v-5Z" stroke="currentColor" strokeWidth="1.6" opacity="0.9"/>
          <path d="M12 4c1.2 1 .7 2.2 0 3.2-1-1-1.2-2.2 0-3.2Z" fill="currentColor" opacity="0.8"/>
          <path d="M6 16c1.2-1 2.4-1 3.6 0 1.2 1 2.4 1 3.6 0 1.2-1 2.4-1 3.6 0" stroke="currentColor" strokeWidth="1.6" opacity="0.7"/>
        </svg>
      );
    case "cheers":
      return (
        <svg {...common}>
          <path d="M6 3l4 4-2 7H6L4 7l2-4Z" stroke="currentColor" strokeWidth="1.6" opacity="0.9"/>
          <path d="M18 3l2 4-2 7h-2l-2-7 4-4Z" stroke="currentColor" strokeWidth="1.6" opacity="0.9"/>
          <path d="M10 7l4 0" stroke="currentColor" strokeWidth="1.6" opacity="0.7"/>
          <path d="M9 21h6" stroke="currentColor" strokeWidth="1.6" opacity="0.7"/>
          <path d="M12 14v7" stroke="currentColor" strokeWidth="1.6" opacity="0.7"/>
        </svg>
      );
    case "people":
      return (
        <svg {...common}>
          <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="1.6" opacity="0.9"/>
          <path d="M16 12a2.6 2.6 0 1 0 0-5.2A2.6 2.6 0 0 0 16 12Z" stroke="currentColor" strokeWidth="1.6" opacity="0.8"/>
          <path d="M3.8 20a4.8 4.8 0 0 1 8.4-3.2" stroke="currentColor" strokeWidth="1.6" opacity="0.8"/>
          <path d="M12.5 20a4.2 4.2 0 0 1 7.7-2" stroke="currentColor" strokeWidth="1.6" opacity="0.7"/>
        </svg>
      );
    case "ball":
    default:
      return (
        <svg {...common}>
          <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="1.6" opacity="0.9"/>
          <path d="M7 9l5-3 5 3-2 6H9L7 9Z" stroke="currentColor" strokeWidth="1.6" opacity="0.75"/>
        </svg>
      );
  }
}

function GlobalStyles() {
  return (
    <style jsx global>{`
      .tg_srOnly {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      .tg_root {
        min-height: 100vh;
        position: relative;
        overflow: hidden;
        color: #fff;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial;
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
      .tg_root[data-scene="agenda"] {
        background: radial-gradient(1100px 650px at 15% 20%, rgba(60, 140, 255, 0.26), transparent 60%),
          radial-gradient(900px 700px at 82% 18%, rgba(255, 60, 120, 0.18), transparent 60%),
          radial-gradient(1100px 900px at 62% 96%, rgba(0, 220, 180, 0.14), transparent 60%),
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

      .tg_mark {
        width: 44px;
        height: 44px;
        border-radius: 14px;
        display: grid;
        place-items: center;
        background: rgba(255, 255, 255, 0.07);
        border: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
        overflow: hidden;
      }
      .tg_markImg {
        width: 34px;
        height: 34px;
        object-fit: contain;
        filter: drop-shadow(0 10px 18px rgba(0,0,0,0.35));
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
      }

      .tg_tabs {
        display: flex;
        gap: 10px;
        padding: 10px 14px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(10px);
        align-items: center;
      }
      .tg_tab {
        position: relative;
        display: grid;
        place-items: center;
        height: 34px;
        min-width: 92px;
        padding: 0 12px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(0, 0, 0, 0.12);
        overflow: hidden;
      }
      .tg_tabLogo {
        height: 18px;
        width: auto;
        max-width: 80px;
        object-fit: contain;
        opacity: 0.95;
        filter: drop-shadow(0 10px 18px rgba(0,0,0,0.35));
      }
      .tg_tabText {
        font-size: 12px;
        letter-spacing: 0.14em;
        opacity: 0.9;
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
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .tg_sceneTop {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .tg_title {
        font-weight: 950;
        letter-spacing: -0.05em;
        font-size: 54px;
        margin: 0;
        line-height: 1.04;
      }

      .tg_kicker {
        opacity: 0.85;
        font-size: 14px;
        display: flex;
        gap: 10px;
        align-items: center;
      }
      .dot {
        opacity: 0.6;
      }

      /* Welcome — agora “enche” a tela */
      .tg_welcomeCard {
  display: grid;
  grid-template-columns: 1fr; /* era 32% 1fr */
  gap: 18px;
  align-items: stretch;
  flex: 1;
  min-height: 0;
}

      .tg_welcomeArt {
        position: relative;
        border-radius: 22px;
        border: 1px solid rgba(255, 255, 255, 0.10);
        background: rgba(255, 255, 255, 0.04);
        overflow: hidden;
        min-height: 480px;
      }
      .tg_welcomeStamp {
        position: absolute;
        left: 18px;
        bottom: 18px;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.22);
        border: 1px solid rgba(255, 255, 255, 0.10);
        font-size: 12px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        opacity: 0.9;
      }
      .blob {
        position: absolute;
        width: 380px;
        height: 380px;
        border-radius: 999px;
        filter: blur(18px);
        opacity: 0.85;
      }
      .b1 {
        left: -140px;
        top: -140px;
        background: radial-gradient(circle at 30% 30%, rgba(60, 80, 255, 0.9), rgba(60, 80, 255, 0.0) 60%);
      }
      .b2 {
        right: -140px;
        top: -80px;
        background: radial-gradient(circle at 60% 40%, rgba(0, 220, 180, 0.85), rgba(0, 220, 180, 0.0) 60%);
      }
      .b3 {
        left: 40px;
        bottom: -200px;
        background: radial-gradient(circle at 40% 60%, rgba(255, 30, 140, 0.75), rgba(255, 30, 140, 0.0) 60%);
      }
      .grid {
        position: absolute;
        inset: 0;
        background-image: linear-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px);
        background-size: 46px 46px;
        mask-image: radial-gradient(circle at 30% 30%, rgba(0, 0, 0, 1), transparent 65%);
        opacity: 0.6;
      }

      .tg_aboutWrap {
        border-radius: 22px;
        border: 1px solid rgba(255, 255, 255, 0.10);
        background: rgba(255, 255, 255, 0.035);
        padding: 18px;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }

      .tg_aboutWrapSolo {
  height: 100%;
}

.tg_aboutCards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-areas:
    "mission vision"
    "values values";
  gap: 14px;
  flex: 1;
  min-height: 0;
  align-items: stretch;
}

.tg_aboutCard.mission { grid-area: mission; }
.tg_aboutCard.vision { grid-area: vision; }
.tg_aboutCard.values { grid-area: values; }

.tg_aboutCard.values .tg_values {
  grid-template-columns: 1fr 1fr; /* valores em 2 colunas */
}

      .tg_aboutHeader {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }
      .tg_pill {
        padding: 8px 12px;
        border-radius: 999px;
        font-size: 12px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        border: 1px solid rgba(255, 255, 255, 0.10);
        background: rgba(0, 0, 0, 0.18);
      }
      .tg_aboutHint {
        font-size: 12px;
        opacity: 0.75;
        white-space: nowrap;
      }

      .tg_aboutCards {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 14px;
        flex: 1;
        min-height: 0;
        align-items: stretch;
      }

      .tg_aboutCard {
        border-radius: 18px;
        padding: 18px 16px;
        background: rgba(0, 0, 0, 0.18);
        border: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-height: 0;
      }
      .tg_aboutCard.mission {
        box-shadow: inset 0 2px 0 rgba(255, 60, 160, 0.35);
      }
      .tg_aboutCard.vision {
        box-shadow: inset 0 2px 0 rgba(60, 140, 255, 0.35);
      }
      .tg_aboutCard.values {
        box-shadow: inset 0 2px 0 rgba(0, 220, 180, 0.30);
      }

      .tg_aboutLabel {
        font-size: 13px;
        opacity: 0.78;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .tg_aboutText {
        font-size: 26px;
        line-height: 1.1;
        font-weight: 950;
        letter-spacing: -0.03em;
      }
      .tg_aboutMini {
        opacity: 0.78;
        font-size: 12px;
        font-weight: 700;
        margin-top: auto;
      }
      .tg_values {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 10px;
      }
      .tg_value {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        font-size: 14px;
        opacity: 0.92;
        font-weight: 800;
      }
      .check {
        width: 20px;
        height: 20px;
        border-radius: 8px;
        display: grid;
        place-items: center;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.10);
        flex: 0 0 20px;
        margin-top: 1px;
      }

      .tg_welcomeFooter {
        margin-top: 14px;
        opacity: 0.75;
        font-size: 12px;
      }

      /* Posters 3 por tela */
      .tg_postersRow3 {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 16px;
        flex: 1;
        min-height: 0;
      }
      .tg_posterFrame {
        position: relative;
        border-radius: 22px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(255, 255, 255, 0.03);
        overflow: hidden;
        height: 100%;
        min-height: 520px;
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
        flex: 1;
        min-height: 0;
      }
      .tg_birthdaysShowcase {
        border-radius: 22px;
        border: 1px solid rgba(255, 255, 255, 0.10);
        background: rgba(255, 255, 255, 0.03);
        padding: 14px;
        min-height: 0;
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
        min-height: 420px;
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
        min-height: 0;
      }
      .tg_listTitle {
        font-weight: 950;
        letter-spacing: -0.02em;
        margin-bottom: 12px;
        font-size: 16px;
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
        font-weight: 700;
      }

      /* Weather V2 (preenche melhor) */
      .tg_weatherGridV2 {
        display: grid;
        grid-template-columns: 1.2fr 0.8fr;
        grid-template-rows: auto auto auto;
        gap: 16px;
        flex: 1;
        min-height: 0;
      }
      .tg_weatherNowV2,
      .tg_weatherNextV2,
      .tg_weatherHourlyV2,
      .tg_weatherAlerts,
      .tg_weatherSummary {
        border-radius: 22px;
        border: 1px solid rgba(255, 255, 255, 0.10);
        background: rgba(255, 255, 255, 0.03);
        padding: 14px;
      }
      .tg_weatherNowV2 {
        grid-column: 1 / span 1;
      }
      .tg_weatherNextV2 {
        grid-column: 2 / span 1;
      }
      .tg_weatherHourlyV2 {
        grid-column: 1 / span 2;
      }
      .tg_weatherAlerts {
        grid-column: 1 / span 1;
      }
      .tg_weatherSummary {
        grid-column: 2 / span 1;
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
      }

      .tg_weatherMiniRow {
        margin-top: 10px;
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .tg_panelTitle {
        font-weight: 950;
        margin-bottom: 10px;
        opacity: 0.95;
        letter-spacing: -0.02em;
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
        font-weight: 950;
      }
      .tg_dim {
        opacity: 0.65;
        font-weight: 900;
      }
      .tg_hourTemp {
        font-weight: 950;
        font-size: 18px;
      }
      .tg_hourMini,
      .tg_dayMini {
        margin-top: 6px;
        opacity: 0.75;
        font-weight: 800;
        font-size: 12px;
      }

      .tg_alertRow {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        align-items: center;
      }
      .tg_alertPill {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.10);
        background: rgba(0, 0, 0, 0.22);
        font-weight: 900;
        font-size: 12px;
      }
      .tg_alertDot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.9);
        opacity: 0.9;
      }
      .tg_alertPill.rain .tg_alertDot { background: rgba(0, 220, 180, 0.95); }
      .tg_alertPill.uv .tg_alertDot { background: rgba(255, 140, 30, 0.95); }
      .tg_alertPill.wind .tg_alertDot { background: rgba(60, 140, 255, 0.95); }

      .tg_summaryLine {
        font-weight: 950;
        letter-spacing: -0.02em;
        font-size: 16px;
        opacity: 0.92;
        padding: 10px 10px;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(0,0,0,0.16);
      }

      /* News V2 (layout igual seus prints na TV) */
      .tg_newsGridV2 {
        display: grid;
        grid-template-columns: 1.55fr 1fr;
        grid-template-rows: auto auto;
        gap: 14px;
        flex: 1;
        min-height: 0;
      }
      .tg_newsFeaturedV2 {
        grid-column: 1 / span 1;
        grid-row: 1 / span 2;
        min-height: 520px;
      }
      .tg_newsRightTop {
        grid-column: 2 / span 1;
        grid-row: 1 / span 1;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        min-height: 260px;
      }
      .tg_newsBottomRow {
        grid-column: 2 / span 1;
        grid-row: 2 / span 1;
        display: grid;
        grid-template-columns: 1fr;
        gap: 12px;
      }

      .tg_newsCardV2 {
        position: relative;
        border-radius: 22px;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.10);
        background: rgba(255, 255, 255, 0.03);
        min-height: 160px;
      }
      .tg_newsCardV2.featured {
        min-height: 100%;
      }
      .tg_newsCardV2.compact {
        min-height: 140px;
      }
      .tg_newsBg {
        position: absolute;
        inset: 0;
      }
      .tg_newsBgImg {
        width: 100%;
        height: 100%;
        object-fit: cover;
        filter: saturate(1.05) contrast(1.03);
        transform: scale(1.03);
      }
      .tg_newsBgShade {
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, rgba(0,0,0,0.72), rgba(0,0,0,0.25));
      }
      .tg_newsOverlay {
        position: relative;
        z-index: 1;
        padding: 16px;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        gap: 10px;
      }
      .tg_newsPill {
        align-self: flex-start;
        display: inline-flex;
        gap: 8px;
        align-items: center;
        padding: 8px 10px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(0,0,0,0.22);
        backdrop-filter: blur(10px);
        font-weight: 950;
        font-size: 12px;
      }
      .tg_newsPillDot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: rgba(255,255,255,0.95);
        opacity: 0.9;
      }
      .tg_newsTitleV2 {
        font-weight: 950;
        letter-spacing: -0.03em;
        font-size: 18px;
        line-height: 1.1;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .tg_newsCardV2.featured .tg_newsTitleV2 {
        font-size: 26px;
        -webkit-line-clamp: 5;
      }
      .tg_newsMetaV2 {
        opacity: 0.85;
        font-size: 12px;
        font-weight: 800;
      }
      .tg_newsDomainV2 { opacity: 0.9; }

      /* Agenda GC */
      .tg_agendaGrid {
        display: grid;
        grid-template-columns: 0.95fr 1.05fr;
        gap: 16px;
        flex: 1;
        min-height: 0;
      }
      .tg_agendaNext,
      .tg_agendaList {
        border-radius: 22px;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(255,255,255,0.03);
        padding: 16px;
        position: relative;
        overflow: hidden;
      }
      .tg_agendaNextHeader {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 12px;
      }
      .tg_agendaMonth {
        opacity: 0.8;
        font-weight: 900;
        letter-spacing: -0.02em;
      }

      .tg_agendaNextCard {
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(0,0,0,0.18);
        padding: 14px;
        display: grid;
        grid-template-columns: 60px 1fr;
        gap: 12px;
        align-items: center;
        min-height: 180px;
        position: relative;
      }
      .tg_agendaNextIcon {
        width: 52px;
        height: 52px;
        border-radius: 18px;
        display: grid;
        place-items: center;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(255,255,255,0.06);
      }
      .tg_agendaNextIcon svg { opacity: 0.95; }
      .tg_agendaNextBody { min-width: 0; }
      .tg_agendaNextTitle {
        font-weight: 950;
        letter-spacing: -0.03em;
        font-size: 22px;
        line-height: 1.05;
      }
      .tg_agendaNextSub {
        opacity: 0.85;
        font-weight: 800;
        margin-top: 6px;
        font-size: 13px;
      }
      .tg_agendaNextMeta {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 10px;
      }
      .tg_agendaChips {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 10px;
      }
      .tg_agendaFooterNote {
        margin-top: 12px;
        opacity: 0.75;
        font-weight: 800;
        font-size: 12px;
      }

      .tg_agendaDeco {
        position: absolute;
        right: -40px;
        bottom: -40px;
        opacity: 0.10;
        transform: scale(3.2);
        pointer-events: none;
      }
      .tg_agendaSideDeco {
        position: absolute;
        right: 14px;
        bottom: 12px;
        display: flex;
        gap: 12px;
        opacity: 0.14;
        pointer-events: none;
      }
      .tg_agendaListItems {
        display: grid;
        gap: 12px;
        margin-top: 10px;
      }
      .tg_agendaItem {
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(0,0,0,0.18);
        padding: 12px;
        display: grid;
        grid-template-columns: 44px 1fr;
        gap: 12px;
        align-items: center;
      }
      .tg_agendaItemIcon {
        width: 40px;
        height: 40px;
        border-radius: 14px;
        display: grid;
        place-items: center;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(255,255,255,0.06);
      }
      .tg_agendaItemIcon svg { opacity: 0.95; }
      .tg_agendaItemBody { min-width: 0; }
      .tg_agendaItemTop {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: baseline;
      }
      .tg_agendaItemTitle {
        font-weight: 950;
        letter-spacing: -0.02em;
        font-size: 16px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .tg_agendaItemWhen {
        opacity: 0.85;
        font-weight: 900;
        font-size: 12px;
        white-space: nowrap;
      }
      .tg_agendaItemBottom {
        margin-top: 6px;
        opacity: 0.86;
        font-weight: 800;
        font-size: 12px;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
      }
      .tg_dotSm { opacity: 0.5; }
      .tg_agendaItemChips { opacity: 0.8; }

      /* Footer */
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
        font-weight: 950;
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
        font-weight: 950;
        font-size: 12px;
        opacity: 0.9;
      }
      .tg_chipTiny {
        padding: 8px 10px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.10);
        background: rgba(0, 0, 0, 0.20);
        backdrop-filter: blur(10px);
        font-weight: 900;
        font-size: 12px;
        opacity: 0.92;
        white-space: nowrap;
      }
      .tg_chipSm {
        padding: 8px 10px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.10);
        background: rgba(0, 0, 0, 0.20);
        backdrop-filter: blur(10px);
        font-weight: 900;
        font-size: 12px;
        opacity: 0.92;
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

      /* TV mode: deixa MAIS “TV-friendly”, não menor */
      .tg_root.tv .tg_time { font-size: 64px; }
.tg_root.tv .tg_title { font-size: 58px; }
.tg_root.tv .tg_scene { padding: 30px; }

.tg_root.tv .tg_aboutText { font-size: 34px; }
.tg_root.tv .tg_aboutLabel { font-size: 14px; }
.tg_root.tv .tg_value { font-size: 16px; }
.tg_root.tv .tg_aboutCard { padding: 22px 20px; }

      /* auto-otimização quando a tela for grande (TV) */
      @media (min-width: 1500px) and (min-height: 800px) {
        .tg_title { font-size: 60px; }
        .tg_time { font-size: 66px; }
        .tg_scene { min-height: calc(100vh - 180px); }
        .tg_welcomeArt { min-height: 560px; }
        .tg_posterFrame { min-height: 560px; }
      }
    `}</style>
  );
}