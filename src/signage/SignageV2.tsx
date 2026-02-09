"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { SIGNAGE_CONFIG } from "../config";
import MusicDock from "../components/MusicDock";

type ScreenId = "welcome" | "birthdays" | "weather" | "news" | "arrivals";

type NewsItem = {
  title: string;
  source?: string;
  url?: string;
  image?: string;
};

type WeatherNow = {
  tempC?: number;
  description?: string;
  emoji?: string;
};

type WeatherHour = {
  time: string; // ISO
  tempC?: number;
  description?: string;
  emoji?: string;
};

type WeatherDay = {
  date: string; // YYYY-MM-DD
  minC?: number;
  maxC?: number;
  description?: string;
  emoji?: string;
};

type WeatherPayload = {
  ok: boolean;
  // backward compat (se já existia)
  tempC?: number;
  description?: string;
  emoji?: string;

  current?: WeatherNow;
  hourly?: WeatherHour[];
  daily?: WeatherDay[];
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatDatePt(d: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
}

function monthNamePt(monthIndex0: number) {
  const d = new Date(2026, monthIndex0, 1);
  return new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(d);
}

function weekdayShortPt(d: Date) {
  const txt = new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(d);
  // “seg.” -> “seg”
  return txt.replace(".", "").toLowerCase();
}

function safeNumber(v: any): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Espera mmdd (ex: 0203) ou "02/03" etc.
 * Retorna { monthIndex0, day }
 */
function parseMonthDay(mmdd: string): { monthIndex0: number; day: number } | null {
  if (!mmdd) return null;
  const s = String(mmdd).trim();
  const digits = s.replace(/\D/g, "");
  if (digits.length < 4) return null;

  // assume MMDD
  const mm = Number(digits.slice(0, 2));
  const dd = Number(digits.slice(2, 4));
  if (!mm || !dd) return null;
  return { monthIndex0: mm - 1, day: dd };
}

/**
 * Label “Giulia Costa • Facilities • T.Group”
 * ou “Giulia • T.Group”
 */
function splitLabel(label?: string) {
  const raw = (label || "").trim();
  if (!raw) return { name: "", meta: "" };
  const parts = raw.split("•").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 1) return { name: parts[0], meta: "" };
  return { name: parts[0], meta: parts.slice(1).join(" • ") };
}

function normalizeNewsPayload(payload: any): NewsItem[] {
  if (!payload) return [];
  const items = payload.items || payload.news || payload.data || payload;
  if (!Array.isArray(items)) return [];
  return items
    .map((it: any) => {
      if (typeof it === "string") return { title: it };
      const title = String(it.title || it.name || it.headline || "").trim();
      if (!title) return null;
      return {
        title,
        source: it.source || it.site || it.publisher,
        url: it.url || it.link,
        image: it.image || it.thumbnail || it.enclosure,
      } as NewsItem;
    })
    .filter(Boolean) as NewsItem[];
}

function faviconFrom(item: NewsItem) {
  // prioriza URL real (favicons mais confiáveis)
  if (item.url) {
    return `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent(item.url)}`;
  }
  // fallback se source já vier como domínio
  if (item.source && item.source.includes(".")) {
    return `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(item.source)}`;
  }
  return null;
}

function getBrandTabs(cfg: any) {
  const fallback = ["BRANDS", "VENUES", "DREAMS", "YOUTH"].map((t) => ({ key: t, label: t }));
  const tabs = cfg?.brandTabs;
  if (!Array.isArray(tabs)) return fallback;

  return tabs.map((b: any) => {
    if (typeof b === "string") return { key: b, label: b.toUpperCase() };
    const key = String(b.key || b.id || b.slug || b.label || b.name || "").trim() || "TAB";
    const label = String(b.label || b.name || b.key || b.id || "").trim() || key;
    return { key, label: label.toUpperCase() };
  });
}

function clampTitleClass() {
  // só um helper pra ficar legível no JSX
  return "tg-title";
}

function pickScreenOrder(cfg: any): ScreenId[] {
  const configured = cfg?.screenOrder;
  const fallback: ScreenId[] = ["welcome", "birthdays", "weather", "news", "arrivals"];
  if (!Array.isArray(configured)) return fallback;

  const normalized = configured
    .map((s: any) => String(s).trim().toLowerCase())
    .filter(Boolean);

  const allowed = new Set<ScreenId>(["welcome", "birthdays", "weather", "news", "arrivals"]);
  const filtered = normalized.filter((s: string) => allowed.has(s as ScreenId)) as ScreenId[];
  return filtered.length ? filtered : fallback;
}

function useInterval(cb: () => void, ms: number | null) {
  const ref = useRef(cb);
  useEffect(() => {
    ref.current = cb;
  }, [cb]);

  useEffect(() => {
    if (!ms) return;
    const id = window.setInterval(() => ref.current(), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}

export default function SignageV2() {
  const cfg = SIGNAGE_CONFIG as any;

  const [now, setNow] = useState(() => new Date());
  useInterval(() => setNow(new Date()), 1000);

  const params = useMemo(() => {
    if (typeof window === "undefined") return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, []);

  const tvMode = params.get("tv") === "1";
  const forcedScreen = (params.get("screen") || "").toLowerCase() as ScreenId;

  const screenOrder = useMemo(() => pickScreenOrder(cfg), [cfg]);
  const [screen, setScreen] = useState<ScreenId>(() => {
    if (forcedScreen && screenOrder.includes(forcedScreen)) return forcedScreen;
    return screenOrder[0];
  });

  // Rotação automática (só quando não for forçado por query)
  const rotateSeconds = safeNumber(cfg?.rotateSeconds) ?? (tvMode ? 18 : 22);
  useInterval(
    () => {
      if (forcedScreen && screenOrder.includes(forcedScreen)) return;
      setScreen((prev) => {
        const idx = screenOrder.indexOf(prev);
        const next = screenOrder[(idx + 1 + screenOrder.length) % screenOrder.length];
        return next;
      });
    },
    screenOrder.length > 1 ? rotateSeconds * 1000 : null
  );

  // Dados: Weather / News
  const [weather, setWeather] = useState<WeatherPayload | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsErr, setNewsErr] = useState<string | null>(null);

  async function loadWeather() {
    try {
      const res = await fetch("/api/weather", { cache: "no-store" });
      const json = (await res.json()) as WeatherPayload;
      setWeather(json);
    } catch {
      setWeather(null);
    }
  }

  async function loadNews() {
    try {
      const res = await fetch("/api/news", { cache: "no-store" });
      const json = await res.json();
      const items = normalizeNewsPayload(json);
      setNews(items);
      setNewsErr(null);
    } catch {
      setNews([]);
      setNewsErr("Falha ao carregar news");
    }
  }

  useEffect(() => {
    loadWeather();
    loadNews();
    // refresh periódico (clima e notícias)
    const w = window.setInterval(loadWeather, 10 * 60 * 1000);
    const n = window.setInterval(loadNews, 8 * 60 * 1000);
    return () => {
      window.clearInterval(w);
      window.clearInterval(n);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const brandTabs = useMemo(() => getBrandTabs(cfg), [cfg]);

  const locationLabel =
    String(cfg?.locationLabel || "Perdizes - São Paulo").trim() || "Perdizes - São Paulo";

  const groupLogoSrc =
    (SIGNAGE_CONFIG as any)?.groupLogoSrc ||
    (SIGNAGE_CONFIG as any)?.logos?.tgroup ||
    (SIGNAGE_CONFIG as any)?.logoSrc ||
    null;

  // Weather normalization (compat)
  const current: WeatherNow | null = useMemo(() => {
    if (!weather) return null;
    const c = weather.current;
    if (c && (c.tempC !== undefined || c.description || c.emoji)) return c;
    return {
      tempC: weather.tempC,
      description: weather.description,
      emoji: weather.emoji,
    };
  }, [weather]);

  const hourly = useMemo(() => weather?.hourly || [], [weather]);
  const daily = useMemo(() => weather?.daily || [], [weather]);

  const tempNow = useMemo(() => {
    const t = safeNumber(current?.tempC);
    return t !== undefined ? Math.round(t) : undefined;
  }, [current]);

  const topRightTime = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;

  // Ticker (mais lento)
  const tickerDurationSec = safeNumber(cfg?.tickerDurationSec) ?? 52;

  // ====== DATA: Birthdays / Arrivals
  const birthdayPosters = Array.isArray(cfg?.birthdayPosters) ? cfg.birthdayPosters : [];
  const welcomePosters = Array.isArray(cfg?.welcomePosters) ? cfg.welcomePosters : [];

  const monthIndex0 = now.getMonth();

  const birthdaysThisMonth = useMemo(() => {
    const list = birthdayPosters
      .map((p: any) => {
        const md = parseMonthDay(String(p.mmdd || p.date || p.day || ""));
        if (!md) return null;
        if (md.monthIndex0 !== monthIndex0) return null;
        const label = String(p.label || p.name || "").trim();
        const { name, meta } = splitLabel(label);
        return {
          ...p,
          _md: md,
          _name: name || label,
          _meta: meta,
          _label: label,
        };
      })
      .filter(Boolean) as any[];

    // ordem alfabética pelo nome
    list.sort((a, b) => String(a._name).localeCompare(String(b._name), "pt-BR", { sensitivity: "base" }));
    return list;
  }, [birthdayPosters, monthIndex0]);

  const birthdaysToday = useMemo(() => {
    const todayMm = now.getMonth() + 1;
    const todayDd = now.getDate();
    return birthdaysThisMonth.filter((p: any) => p?._md?.day === todayDd && (p?._md?.monthIndex0 ?? -1) === todayMm - 1);
  }, [birthdaysThisMonth, now]);

  // Seleção visual de posters (2 cards rodando)
  const birthdayShow = useMemo(() => {
    const base = birthdaysToday.length ? birthdaysToday : birthdaysThisMonth;
    if (!base.length) return [];
    const idx = Math.floor((now.getTime() / 1000 / 8) % base.length);
    const a = base[idx];
    const b = base[(idx + 1) % base.length];
    return base.length === 1 ? [a] : [a, b];
  }, [birthdaysToday, birthdaysThisMonth, now]);

  const arrivalsShow = useMemo(() => {
    const base = welcomePosters;
    if (!base.length) return [];
    const idx = Math.floor((now.getTime() / 1000 / 10) % base.length);
    const a = base[idx];
    const b = base[(idx + 1) % base.length];
    return base.length === 1 ? [a] : [a, b];
  }, [welcomePosters, now]);

  // ====== UI helpers
  function Logo() {
    return (
      <div className="tg-logoWrap">
        <div className="tg-logoBlob">
          {groupLogoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="tg-logoImg" src={groupLogoSrc} alt="T.Group" />
          ) : (
            <div className="tg-logoFallback" />
          )}
        </div>
        <div className="tg-brandText">
          <div className="tg-brandName">T.Group</div>
          <div className="tg-brandSub">TV Signage • {locationLabel}</div>
        </div>
      </div>
    );
  }

  function TopNav() {
    return (
      <div className="tg-topbar">
        <Logo />

        <div className="tg-tabs" aria-label="T.Group companies">
          {brandTabs.map((b) => (
            <div key={b.key} className="tg-tab">
              {b.label}
            </div>
          ))}
        </div>

        <div className="tg-clock">
          <div className="tg-time">{topRightTime}</div>
          <div className="tg-date">{formatDatePt(now)}</div>
        </div>
      </div>
    );
  }

  function Ticker() {
    const items = news.slice(0, 12).map((n) => n.title).filter(Boolean);
    const text = items.length ? items.join("  •  ") : (newsErr ? "Sem atualização de notícias agora." : "Carregando notícias…");

    return (
      <div className="tg-ticker">
        <div className="tg-livePill">
          <span className="tg-liveDot" />
          <span>AO VIVO</span>
        </div>

        <div className="tg-marquee" style={{ ["--tgMarqueeDuration" as any]: `${tickerDurationSec}s` }}>
          <div className="tg-marqueeInner">{text}</div>
          <div className="tg-marqueeInner" aria-hidden="true">
            {text}
          </div>
        </div>

        <div className="tg-rightPills">
          <div className="tg-pill">{tempNow !== undefined ? `${tempNow}°C` : "—"}</div>
          <div className="tg-pill">{String(cfg?.locationShort || "Sede • Perdizes")}</div>
        </div>
      </div>
    );
  }

  // ====== Screens
  function ScreenWelcome() {
    const mission =
      String(cfg?.mission || "Criar experiências memoráveis em entretenimento, eventos e live marketing, com excelência na execução.").trim();
    const vision =
      String(cfg?.vision || "Ser referência em entretenimento e live marketing com performance e tecnologia.").trim();
    const values =
      (Array.isArray(cfg?.values) ? cfg.values : null) ||
      [
        "Respeito, diversidade e segurança",
        "Excelência com leveza",
        "Dono(a) do resultado",
        "Criatividade que vira entrega",
        "Transparência e colaboração",
      ];

    return (
      <div className="tg-stage">
        <div className="tg-hero">
          <div className="tg-heroTitleWrap">
            <h1 className={clampTitleClass()}>Bem-vindas, vindes e vindos ao T.Group</h1>
            <div className="tg-heroSub">
              {locationLabel} • Clima agora: {tempNow !== undefined ? `${tempNow}°C` : "—"}
            </div>
          </div>

          <div className="tg-panel">
            <div className="tg-panelKicker">SOBRE A GENTE</div>

            <div className="tg-mvvGrid">
              <div className="tg-mvvBlock">
                <div className="tg-mvvLabel">Missão</div>
                <div className="tg-mvvText">{mission}</div>
              </div>

              <div className="tg-mvvBlock">
                <div className="tg-mvvLabel">Visão</div>
                <div className="tg-mvvText">{vision}</div>
              </div>

              <div className="tg-mvvBlock">
                <div className="tg-mvvLabel">Valores</div>
                <ul className="tg-mvvList">
                  {values.slice(0, 6).map((v: string) => (
                    <li key={v}>{v}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* sem “dicas” na tela */}
        </div>
      </div>
    );
  }

  function ScreenBirthdays() {
    const title = `Aniversários de ${monthNamePt(monthIndex0)}`;

    return (
      <div className="tg-stage">
        <div className="tg-titleRow">
          <h1 className="tg-h1">{title}</h1>
        </div>

        <div className="tg-bdaysGrid">
          <div className="tg-bdaysPosters">
            {birthdayShow.length ? (
              birthdayShow.map((p: any, idx: number) => (
                <div key={`${p.src}-${idx}`} className="tg-posterCard">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="tg-posterImg" src={p.src} alt={String(p.label || "Aniversariante")} />
                  <div className="tg-posterCaption">
                    {String(p.label || "").trim() || "Aniversariante"}
                  </div>
                </div>
              ))
            ) : (
              <div className="tg-emptyCard">
                <div className="tg-emptyTitle">Sem aniversariantes cadastrados</div>
                <div className="tg-emptySub">Adicione em <code>public/signage/birthdays</code> e atualize o <code>birthdayPosters</code> no config.</div>
              </div>
            )}
          </div>

          <div className="tg-bdaysList">
            <div className="tg-listTitle">Lista do mês</div>

            <div className="tg-listWrap">
              {birthdaysThisMonth.length ? (
                birthdaysThisMonth.map((p: any) => {
                  const md = p._md as { monthIndex0: number; day: number } | null;
                  const day = md?.day;
                  const mName = md ? monthNamePt(md.monthIndex0) : "";
                  const { name, meta } = splitLabel(p._label || p.label || "");
                  const metaFinal = meta || p._meta || ""; // meta = “Facilities • T.Group”
                  const row =
                    day
                      ? `${name} — ${day} de ${mName}${metaFinal ? ` — ${metaFinal}` : ""}`
                      : `${name}${metaFinal ? ` — ${metaFinal}` : ""}`;

                  return (
                    <div key={String(p.src || p._label)} className="tg-listItem">
                      <span className="tg-dot" />
                      <span className="tg-listText">{row}</span>
                    </div>
                  );
                })
              ) : (
                <div className="tg-muted">Sem itens neste mês.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function ScreenNews() {
    const items = news.slice(0, 6);

    return (
      <div className="tg-stage">
        <div className="tg-titleRow">
          <h1 className="tg-h1">News</h1>
        </div>

        <div className="tg-newsGrid">
          {items.map((it, idx) => {
            const fav = faviconFrom(it);

            return (
              <div key={`${it.title}-${idx}`} className="tg-newsCard">
                <div className="tg-newsLeft">
                  {it.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="tg-newsThumb" src={it.image} alt="" />
                  ) : (
                    <div className="tg-newsThumb tg-newsThumbFallback" />
                  )}

                  {fav ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="tg-newsFavicon" src={fav} alt="" />
                  ) : (
                    <div className="tg-newsFaviconFallback">
                      {(it.source || "N").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>

                <div className="tg-newsBody">
                  <div className="tg-newsTitle">{it.title}</div>
                  <div className="tg-newsSource">{String(it.source || "").toLowerCase() || "portal"}</div>
                </div>
              </div>
            );
          })}

          {!items.length && (
            <div className="tg-emptyCard">
              <div className="tg-emptyTitle">Carregando news…</div>
              <div className="tg-emptySub">Se necessário, valide o endpoint <code>/api/news</code>.</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  function ScreenWeather() {
    // Próximos dias: pega 5
    const days = daily.slice(0, 5);

    // Próximas horas: filtra a partir de agora
    const nextHours = (() => {
      if (!hourly.length) return [];
      const nowTs = now.getTime();
      const future = hourly
        .map((h) => ({ ...h, _ts: new Date(h.time).getTime() }))
        .filter((h) => Number.isFinite(h._ts) && h._ts >= nowTs)
        .slice(0, 8);
      return future;
    })();

    return (
      <div className="tg-stage">
        <div className="tg-titleRow">
          <h1 className="tg-h1">Clima</h1>
        </div>

        <div className="tg-weatherGrid">
          <div className="tg-weatherNow">
            <div className="tg-weatherNowInner">
              <div className="tg-weatherEmoji">{current?.emoji || "⛅️"}</div>
              <div className="tg-weatherTemp">{tempNow !== undefined ? `${tempNow}°C` : "—"}</div>
              <div className="tg-weatherDesc">{current?.description || "São Paulo"}</div>
            </div>
          </div>

          <div className="tg-weatherDays">
            <div className="tg-miniTitle">Próximos dias</div>
            <div className="tg-daysRow">
              {days.map((d, idx) => {
                const dt = new Date(`${d.date}T12:00:00-03:00`);
                const dow = weekdayShortPt(dt);
                const max = safeNumber(d.maxC);
                const min = safeNumber(d.minC);

                return (
                  <div key={`${d.date}-${idx}`} className="tg-dayCard">
                    <div className="tg-dayDow">{dow}</div>
                    <div className="tg-dayEmoji">{d.emoji || "⛅️"}</div>
                    <div className="tg-dayTemps">
                      <span>{max !== undefined ? `${Math.round(max)}°` : "—"}</span>
                      <span className="tg-daySep">/</span>
                      <span className="tg-dayMin">{min !== undefined ? `${Math.round(min)}°` : "—"}</span>
                    </div>
                  </div>
                );
              })}

              {!days.length && (
                <div className="tg-muted">Sem previsão diária (verifique o /api/weather).</div>
              )}
            </div>
          </div>

          <div className="tg-weatherHours">
            <div className="tg-miniTitle">Hoje (próximas horas)</div>
            <div className="tg-hoursRow">
              {nextHours.map((h: any, idx: number) => {
                const dt = new Date(h.time);
                const label = `${pad2(dt.getHours())}:00`;
                const t = safeNumber(h.tempC);

                return (
                  <div key={`${h.time}-${idx}`} className="tg-hourCard">
                    <div className="tg-hourTime">{label}</div>
                    <div className="tg-hourEmoji">{h.emoji || "⛅️"}</div>
                    <div className="tg-hourTemp">{t !== undefined ? `${Math.round(t)}°` : "—"}</div>
                  </div>
                );
              })}

              {!nextHours.length && (
                <div className="tg-muted">Sem previsão por hora (verifique o /api/weather).</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function ScreenArrivals() {
    return (
      <div className="tg-stage">
        <div className="tg-titleRow tg-titleRowSplit">
          <h1 className="tg-h1">Chegadas do mês</h1>
          <div className="tg-smallRight">fevereiro • nova energia no ar ✨</div>
        </div>

        <div className="tg-arrivalsGrid">
          {arrivalsShow.length ? (
            arrivalsShow.map((p: any, idx: number) => (
              <div key={`${p.src}-${idx}`} className="tg-posterCard tg-posterWide">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="tg-posterImg" src={p.src} alt={String(p.label || "Chegada do mês")} />
                <div className="tg-posterCaption">{String(p.label || "").trim()}</div>
              </div>
            ))
          ) : (
            <div className="tg-emptyCard">
              <div className="tg-emptyTitle">Sem artes cadastradas</div>
              <div className="tg-emptySub">Suba em <code>public/signage/welcome</code> e atualize o <code>welcomePosters</code> no config.</div>
            </div>
          )}
        </div>

        {/* sem “dicas” na tela */}
      </div>
    );
  }

  return (
    <div className="tg-root">
      <TopNav />

      <div className="tg-content">
        {screen === "welcome" && <ScreenWelcome />}
        {screen === "birthdays" && <ScreenBirthdays />}
        {screen === "weather" && <ScreenWeather />}
        {screen === "news" && <ScreenNews />}
        {screen === "arrivals" && <ScreenArrivals />}
      </div>

      <Ticker />

      {/* Player de música (mantido) */}
      <MusicDock />

      <style jsx global>{`
        :root {
          --tg-glass: rgba(255, 255, 255, 0.08);
          --tg-glass-2: rgba(255, 255, 255, 0.10);
          --tg-border: rgba(255, 255, 255, 0.14);
          --tg-text: rgba(255, 255, 255, 0.92);
          --tg-muted: rgba(255, 255, 255, 0.70);
          --tg-dim: rgba(255, 255, 255, 0.55);
          --tg-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
          --tg-radius: 28px;
        }

        .tg-root {
          min-height: 100vh;
          color: var(--tg-text);
          overflow: hidden;
          position: relative;
          background: #070a12;
        }

        /* Fundo mais vibrante, sem “preto chapado” */
        .tg-root::before {
          content: "";
          position: absolute;
          inset: -25%;
          background:
            radial-gradient(900px 600px at 18% 22%, rgba(82, 138, 255, 0.30), transparent 60%),
            radial-gradient(800px 520px at 74% 24%, rgba(64, 255, 197, 0.22), transparent 58%),
            radial-gradient(900px 640px at 64% 78%, rgba(255, 64, 164, 0.20), transparent 60%),
            radial-gradient(900px 680px at 20% 86%, rgba(255, 122, 48, 0.18), transparent 62%),
            linear-gradient(180deg, rgba(0, 0, 0, 0.25), rgba(0, 0, 0, 0.55));
          filter: saturate(1.25) brightness(1.05);
          transform: translateZ(0);
          animation: tgDrift 18s ease-in-out infinite alternate;
          pointer-events: none;
        }

        @keyframes tgDrift {
          from { transform: translate3d(-0.8%, -0.6%, 0) scale(1.02); }
          to   { transform: translate3d(0.8%, 0.6%, 0) scale(1.06); }
        }

        .tg-root > * {
          position: relative;
          z-index: 1;
        }

        .tg-topbar {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 18px;
          padding: 20px 28px 14px;
        }

        .tg-logoWrap {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .tg-logoBlob {
          width: 44px;
          height: 44px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 10px 30px rgba(0,0,0,0.25);
          overflow: hidden;
          display: grid;
          place-items: center;
        }

        .tg-logoImg {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .tg-logoFallback {
          width: 18px;
          height: 18px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.16);
        }

        .tg-brandText .tg-brandName {
          font-weight: 800;
          letter-spacing: -0.02em;
          font-size: 18px;
          line-height: 1.0;
        }

        .tg-brandText .tg-brandSub {
          font-size: 13px;
          color: var(--tg-muted);
          margin-top: 3px;
        }

        .tg-tabs {
          display: flex;
          gap: 10px;
          justify-content: center;
          align-items: center;
        }

        .tg-tab {
          padding: 9px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(0, 0, 0, 0.22);
          backdrop-filter: blur(16px);
          font-size: 12px;
          letter-spacing: 0.12em;
          color: rgba(255, 255, 255, 0.88);
        }

        .tg-clock {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 6px;
        }

        .tg-time {
          font-size: 56px;
          font-weight: 900;
          letter-spacing: -0.05em;
          line-height: 1;
        }

        .tg-date {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.78);
          text-align: right;
        }

        .tg-content {
          padding: 0 28px;
        }

        .tg-stage {
          border-radius: var(--tg-radius);
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(0, 0, 0, 0.22);
          box-shadow: var(--tg-shadow);
          backdrop-filter: blur(18px);
          padding: 26px;
          min-height: calc(100vh - 170px);
        }

        .tg-titleRow {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
        }

        .tg-titleRowSplit {
          align-items: center;
        }

        .tg-h1 {
          font-size: clamp(46px, 4.6vw, 74px);
          font-weight: 900;
          letter-spacing: -0.04em;
          margin: 0;
          line-height: 0.98;
        }

        .tg-smallRight {
          color: rgba(255, 255, 255, 0.72);
          font-size: 14px;
          white-space: nowrap;
        }

        /* Welcome */
        .tg-hero {
          display: grid;
          grid-template-rows: auto 1fr;
          gap: 18px;
        }

        .tg-heroTitleWrap {
          padding-top: 6px;
        }

        .tg-title {
          font-size: clamp(38px, 4.2vw, 68px);
          font-weight: 900;
          letter-spacing: -0.04em;
          line-height: 1.02;
          margin: 0;
          max-width: 1200px;
          text-wrap: balance;
        }

        .tg-heroSub {
          margin-top: 10px;
          color: rgba(255, 255, 255, 0.78);
          font-size: 16px;
        }

        .tg-panel {
          border-radius: 22px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          padding: 18px 18px 16px;
          max-width: 1180px;
        }

        .tg-panelKicker {
          display: inline-flex;
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(0, 0, 0, 0.18);
          font-size: 11px;
          letter-spacing: 0.14em;
          color: rgba(255, 255, 255, 0.78);
          margin-bottom: 14px;
        }

        .tg-mvvGrid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }

        .tg-mvvBlock {
          border-radius: 18px;
          background: rgba(0, 0, 0, 0.18);
          border: 1px solid rgba(255, 255, 255, 0.10);
          padding: 14px 14px 12px;
        }

        .tg-mvvLabel {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.78);
          margin-bottom: 10px;
          font-weight: 700;
          letter-spacing: -0.01em;
        }

        .tg-mvvText {
          font-size: 16px;
          line-height: 1.35;
          color: rgba(255, 255, 255, 0.90);
          font-weight: 650;
        }

        .tg-mvvList {
          margin: 0;
          padding-left: 18px;
          color: rgba(255, 255, 255, 0.88);
          font-size: 15px;
          line-height: 1.45;
          font-weight: 600;
        }

        /* Birthdays */
        .tg-bdaysGrid {
          display: grid;
          grid-template-columns: 1.45fr 1fr;
          gap: 18px;
          height: 100%;
        }

        .tg-bdaysPosters {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
          align-content: start;
        }

        .tg-bdaysList {
          border-radius: 22px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          padding: 16px;
          height: fit-content;
        }

        .tg-listTitle {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.78);
          font-weight: 700;
          margin-bottom: 12px;
        }

        .tg-listWrap {
          display: grid;
          gap: 10px;
        }

        .tg-listItem {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 12px;
          border-radius: 16px;
          background: rgba(0, 0, 0, 0.20);
          border: 1px solid rgba(255, 255, 255, 0.10);
        }

        .tg-dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.85);
          opacity: 0.9;
        }

        .tg-listText {
          color: rgba(255, 255, 255, 0.90);
          font-size: 15px;
          font-weight: 650;
        }

        /* Posters (birthdays / arrivals) */
        .tg-posterCard {
          border-radius: 22px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          position: relative;
          min-height: 340px;
        }

        .tg-posterWide {
          min-height: 420px;
        }

        .tg-posterImg {
          width: 100%;
          height: 100%;
          object-fit: contain; /* evita “estourar” arte */
          background: rgba(0, 0, 0, 0.25);
        }

        .tg-posterCaption {
          position: absolute;
          left: 14px;
          right: 14px;
          bottom: 14px;
          padding: 10px 12px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.30);
          border: 1px solid rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(14px);
          font-weight: 700;
          color: rgba(255, 255, 255, 0.92);
          font-size: 14px;
        }

        /* News */
        .tg-newsGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .tg-newsCard {
          border-radius: 22px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          overflow: hidden;
          display: grid;
          grid-template-columns: 180px 1fr;
          min-height: 140px;
        }

        .tg-newsLeft {
          position: relative;
          background: rgba(0, 0, 0, 0.22);
        }

        .tg-newsThumb {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: 0.78;
          filter: saturate(1.1);
        }

        .tg-newsThumbFallback {
          background: radial-gradient(220px 160px at 40% 30%, rgba(255,255,255,0.14), transparent 62%);
        }

        .tg-newsFavicon,
        .tg-newsFaviconFallback {
          position: absolute;
          top: 14px;
          left: 14px;
          width: 30px;
          height: 30px;
          border-radius: 10px;
          background: rgba(0, 0, 0, 0.28);
          border: 1px solid rgba(255, 255, 255, 0.14);
          backdrop-filter: blur(10px);
          display: grid;
          place-items: center;
          color: rgba(255,255,255,0.92);
          font-weight: 900;
          letter-spacing: -0.02em;
        }

        .tg-newsBody {
          padding: 16px 16px 14px;
          display: grid;
          gap: 10px;
          align-content: center;
        }

        .tg-newsTitle {
          font-size: 16px;
          line-height: 1.25;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: rgba(255, 255, 255, 0.92);
        }

        .tg-newsSource {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.68);
          text-transform: lowercase;
        }

        /* Weather */
        .tg-weatherGrid {
          display: grid;
          grid-template-columns: 1.35fr 1fr;
          grid-template-rows: auto 1fr;
          gap: 14px;
        }

        .tg-weatherNow {
          border-radius: 22px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          padding: 18px;
          min-height: 180px;
        }

        .tg-weatherNowInner {
          display: grid;
          grid-template-columns: auto 1fr;
          grid-template-rows: auto auto;
          gap: 6px 14px;
          align-items: center;
        }

        .tg-weatherEmoji {
          grid-row: span 2;
          font-size: 54px;
          filter: drop-shadow(0 10px 18px rgba(0,0,0,0.35));
        }

        .tg-weatherTemp {
          font-size: 60px;
          font-weight: 900;
          letter-spacing: -0.05em;
          line-height: 1;
        }

        .tg-weatherDesc {
          font-size: 16px;
          color: rgba(255, 255, 255, 0.78);
          margin-top: 4px;
        }

        .tg-weatherDays {
          border-radius: 22px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          padding: 16px;
          min-height: 180px;
        }

        .tg-weatherHours {
          grid-column: 1 / -1;
          border-radius: 22px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          padding: 16px;
        }

        .tg-miniTitle {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.78);
          font-weight: 800;
          margin-bottom: 12px;
        }

        .tg-daysRow {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 10px;
        }

        .tg-dayCard {
          border-radius: 16px;
          background: rgba(0, 0, 0, 0.20);
          border: 1px solid rgba(255, 255, 255, 0.10);
          padding: 12px 10px 10px;
          display: grid;
          gap: 6px;
          justify-items: center;
        }

        .tg-dayDow {
          font-size: 12px;
          letter-spacing: 0.12em;
          color: rgba(255, 255, 255, 0.72);
          font-weight: 900;
          text-transform: lowercase;
        }

        .tg-dayEmoji {
          font-size: 22px;
        }

        .tg-dayTemps {
          font-size: 13px;
          font-weight: 850;
          letter-spacing: -0.02em;
          color: rgba(255, 255, 255, 0.90);
          display: inline-flex;
          align-items: baseline;
          gap: 6px;
        }

        .tg-daySep {
          color: rgba(255, 255, 255, 0.55);
          font-weight: 700;
        }

        .tg-dayMin {
          color: rgba(255, 255, 255, 0.70);
          font-weight: 800;
        }

        .tg-hoursRow {
          display: grid;
          grid-template-columns: repeat(8, minmax(0, 1fr));
          gap: 10px;
        }

        .tg-hourCard {
          border-radius: 16px;
          background: rgba(0, 0, 0, 0.20);
          border: 1px solid rgba(255, 255, 255, 0.10);
          padding: 12px 10px 10px;
          display: grid;
          gap: 6px;
          justify-items: center;
        }

        .tg-hourTime {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.78);
          font-weight: 900;
        }

        .tg-hourEmoji {
          font-size: 22px;
        }

        .tg-hourTemp {
          font-size: 14px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.92);
        }

        /* Arrivals */
        .tg-arrivalsGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        /* Empty / muted */
        .tg-emptyCard {
          border-radius: 22px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          padding: 18px;
        }

        .tg-emptyTitle {
          font-weight: 900;
          font-size: 18px;
          letter-spacing: -0.02em;
        }

        .tg-emptySub {
          margin-top: 8px;
          color: rgba(255, 255, 255, 0.72);
          font-size: 14px;
          line-height: 1.35;
        }

        .tg-muted {
          color: rgba(255, 255, 255, 0.68);
          font-size: 14px;
        }

        /* Ticker */
        .tg-ticker {
          position: fixed;
          left: 24px;
          right: 24px;
          bottom: 18px;
          height: 54px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.26);
          border: 1px solid rgba(255, 255, 255, 0.14);
          backdrop-filter: blur(18px);
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          box-shadow: 0 18px 60px rgba(0,0,0,0.35);
        }

        .tg-livePill {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.26);
          border: 1px solid rgba(255, 255, 255, 0.14);
          color: rgba(255, 255, 255, 0.90);
          font-weight: 900;
          letter-spacing: 0.14em;
          font-size: 11px;
        }

        .tg-liveDot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: rgb(255, 70, 70);
          box-shadow: 0 0 0 6px rgba(255, 70, 70, 0.14);
        }

        .tg-marquee {
          overflow: hidden;
          position: relative;
          height: 100%;
          display: flex;
          align-items: center;
          mask-image: linear-gradient(90deg, transparent, black 10%, black 90%, transparent);
        }

        .tg-marqueeInner {
          display: inline-block;
          white-space: nowrap;
          padding-right: 40px;
          animation: tgMarquee var(--tgMarqueeDuration) linear infinite;
          color: rgba(255, 255, 255, 0.80);
          font-weight: 700;
          font-size: 13px;
        }

        @keyframes tgMarquee {
          from { transform: translateX(0); }
          to { transform: translateX(-100%); }
        }

        .tg-rightPills {
          display: inline-flex;
          gap: 10px;
          align-items: center;
        }

        .tg-pill {
          padding: 10px 14px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.26);
          border: 1px solid rgba(255, 255, 255, 0.14);
          color: rgba(255, 255, 255, 0.88);
          font-weight: 850;
          font-size: 12px;
        }

        /* Responsivo mínimo (mas foco é TV) */
        @media (max-width: 1100px) {
          .tg-weatherGrid {
            grid-template-columns: 1fr;
          }
          .tg-newsCard {
            grid-template-columns: 160px 1fr;
          }
          .tg-bdaysGrid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 820px) {
          .tg-time {
            font-size: 44px;
          }
          .tg-tabs {
            display: none;
          }
          .tg-hoursRow {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
          .tg-daysRow {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
      `}</style>
    </div>
  );
}