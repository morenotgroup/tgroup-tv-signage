"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { SIGNAGE_CONFIG } from "../config";
import MusicDock from "../components/MusicDock";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function formatTimePtBR(now: Date) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(now);
}

function formatDatePtBR(now: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(now);
}

function formatMonthPtBR(monthIndex: number) {
  const d = new Date(2026, monthIndex, 1);
  return new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(d);
}

type WeatherLike = {
  tempC?: number;
  temp?: number;
  temperature?: number;
  description?: string;
  condition?: string;
  icon?: string;
  emoji?: string;

  // “premium”
  hourly?: Array<{ time?: string; tempC?: number; temp?: number; temperature?: number; emoji?: string; description?: string }>;
  daily?: Array<{ date?: string; minC?: number; maxC?: number; emoji?: string; description?: string }>;
};

type NewsItem = {
  title: string;
  url?: string;
  source?: string;
  image?: string;
};

function readTempC(weather: WeatherLike | null): number | null {
  if (!weather) return null;
  const v = Number(weather.tempC ?? weather.temp ?? weather.temperature ?? NaN);
  return Number.isFinite(v) ? v : null;
}

function domainFromUrl(u?: string) {
  if (!u) return "";
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function faviconFor(domain: string) {
  if (!domain) return "";
  // Google S2 favicons (simples, rápido e funciona bem em TV)
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

function normalizeNews(payload: any): NewsItem[] {
  const raw = payload?.items || payload?.news || payload?.articles || payload?.headlines || [];
  if (!Array.isArray(raw)) return [];

  const items: NewsItem[] = raw
    .map((x: any) => {
      if (typeof x === "string") return { title: x };
      const title = String(x?.title || x?.headline || "").trim();
      if (!title) return null;
      return {
        title,
        url: x?.url || x?.link,
        source: x?.source || x?.site || domainFromUrl(x?.url || x?.link),
        image: x?.image || x?.thumbnail || x?.thumb || x?.enclosure,
      } as NewsItem;
    })
    .filter(Boolean) as NewsItem[];

  // remove duplicados por title
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const it of items) {
    const k = it.title.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out.slice(0, 18);
}

function normalizeTicker(items: NewsItem[], fallback: string) {
  const base = items.length
    ? items
        .slice(0, 12)
        .map((i) => (i.source ? `${i.title} — ${i.source}` : i.title))
        .join(" • ")
    : fallback;

  return base.endsWith("•") ? base : `${base} •`;
}

type Poster = { src: string; label?: string; mmdd?: string; mm?: string };

function isMmddMatch(key: string, mm: number, dd: number) {
  const mmdd = `${pad2(mm)}${pad2(dd)}`;
  const ddmm = `${pad2(dd)}${pad2(mm)}`;
  return key === mmdd || key === ddmm;
}

export default function SignageV2() {
  const CFG = SIGNAGE_CONFIG as any; // evita erro chato de typing (ex: groupLogoSrc)

  const [now, setNow] = useState(() => new Date());
  const [scene, setScene] = useState(0);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const [weather, setWeather] = useState<WeatherLike | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);

  const [manifestoIndex, setManifestoIndex] = useState(0);
  const wakeLockRef = useRef<any>(null);

  const tvMode = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get("tv") === "1";
    } catch {
      return false;
    }
  }, []);

  const monthIndex = now.getMonth(); // 0..11
  const monthKey = useMemo(() => pad2(monthIndex + 1), [monthIndex]);

  const locationLine = useMemo(() => {
    // pedido: manter “Perdizes - São Paulo”
    return CFG.locationLine || "Perdizes - São Paulo";
  }, [CFG.locationLine]);

  const manifestoLines: string[] = useMemo(() => {
    // Você pode sobrescrever no config com `manifestoLines`
    return (
      (Array.isArray(CFG.manifestoLines) && CFG.manifestoLines.length ? CFG.manifestoLines : null) || [
        "Missão: criar experiências memoráveis que conectam pessoas, marcas e cultura.",
        "Visão: ser referência em entretenimento e live marketing com performance e tecnologia.",
        "Valores: respeito, diversidade, espaços seguros, excelência e espírito de time.",
        "Aqui a energia é jovem — e o cuidado com gente é sério.",
      ]
    );
  }, [CFG.manifestoLines]);

  // relógio
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // manifesto rotativo (home)
  useEffect(() => {
    const t = setInterval(() => {
      setManifestoIndex((i) => (i + 1) % Math.max(1, manifestoLines.length));
    }, 5500);
    return () => clearInterval(t);
  }, [manifestoLines.length]);

  // fetch weather/news
  useEffect(() => {
    let alive = true;

    async function refreshAll() {
      try {
        const [w, n] = await Promise.allSettled([
          fetch("/api/weather", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/news", { cache: "no-store" }).then((r) => r.json()),
        ]);

        if (!alive) return;

        if (w.status === "fulfilled") setWeather(w.value || null);

        if (n.status === "fulfilled") {
          const items = normalizeNews(n.value);
          setNews(items);
        }

        setLastSync(new Date());
      } catch {
        if (!alive) return;
        setLastSync(new Date());
      }
    }

    void refreshAll();

    const wt = setInterval(refreshAll, Number(CFG.refreshWeatherMs ?? 10 * 60 * 1000));
    const nt = setInterval(refreshAll, Number(CFG.refreshNewsMs ?? 20 * 60 * 1000));

    return () => {
      alive = false;
      clearInterval(wt);
      clearInterval(nt);
    };
  }, [CFG.refreshWeatherMs, CFG.refreshNewsMs]);

  // wake lock (tv)
  useEffect(() => {
    async function lock() {
      try {
        // @ts-ignore
        if ("wakeLock" in navigator && tvMode) {
          // @ts-ignore
          wakeLockRef.current = await navigator.wakeLock.request("screen");
        }
      } catch {}
    }
    void lock();
    return () => {
      try {
        wakeLockRef.current?.release?.();
      } catch {}
    };
  }, [tvMode]);

  // ===== Posters / Aniversariantes =====
  const birthdayPosters: Poster[] = useMemo(() => {
    const list = Array.isArray(CFG.birthdayPosters) ? CFG.birthdayPosters : [];
    return list.filter((x: any) => x?.src);
  }, [CFG.birthdayPosters]);

  const birthdaysToday: Poster[] = useMemo(() => {
    const mm = monthIndex + 1;
    const dd = now.getDate();
    return birthdayPosters.filter((p: any) => p?.mmdd && isMmddMatch(String(p.mmdd), mm, dd));
  }, [birthdayPosters, monthIndex, now]);

  const birthdaysThisMonth: Poster[] = useMemo(() => {
    const mm = monthIndex + 1;
    return birthdayPosters.filter((p: any) => {
      const key = String(p?.mmdd || "");
      return key.startsWith(pad2(mm)) || key.endsWith(pad2(mm));
    });
  }, [birthdayPosters, monthIndex]);

  const monthCarouselPair: Poster[] = useMemo(() => {
    if (!birthdaysThisMonth.length) return [];
    const dur = Number(CFG.sceneDurationMs || 14000);
    const idx = Math.floor((now.getTime() / dur) % birthdaysThisMonth.length);
    const a = birthdaysThisMonth[idx];
    const b = birthdaysThisMonth[(idx + 1) % birthdaysThisMonth.length];
    return [a, b].filter(Boolean) as Poster[];
  }, [birthdaysThisMonth, now, CFG.sceneDurationMs]);

  // ===== Chegadas do mês =====
  const welcomePosters: Poster[] = useMemo(() => {
    const list = Array.isArray(CFG.welcomePosters) ? CFG.welcomePosters : [];
    return list.filter((x: any) => x?.src);
  }, [CFG.welcomePosters]);

  const welcomeMonthList: Poster[] = useMemo(() => {
    return welcomePosters.filter((p: any) => String(p?.mm || "") === monthKey);
  }, [welcomePosters, monthKey]);

  const welcomeCards = useMemo(() => {
    if (!welcomeMonthList.length) return [];
    const max = tvMode ? 4 : 2; // menor e mais elegante na TV
    const dur = Number(CFG.sceneDurationMs || 14000);
    const start = Math.floor((now.getTime() / dur) % welcomeMonthList.length);
    const out: Poster[] = [];
    for (let i = 0; i < Math.min(max, welcomeMonthList.length); i++) {
      out.push(welcomeMonthList[(start + i) % welcomeMonthList.length]);
    }
    return out;
  }, [welcomeMonthList, now, CFG.sceneDurationMs, tvMode]);

  const hasWelcomersThisMonth = welcomeMonthList.length > 0;

  // rotate scenes
  useEffect(() => {
    const ms = clamp(Number(CFG.sceneDurationMs || 14000), 8000, 60000);
    const sceneCount = hasWelcomersThisMonth ? 5 : 4;
    const t = setInterval(() => setScene((s) => (s + 1) % sceneCount), ms);
    return () => clearInterval(t);
  }, [hasWelcomersThisMonth, CFG.sceneDurationMs]);

  const tempC = readTempC(weather);
  const tempLabel = tempC == null ? "—" : `${Math.round(tempC)}°C`;

  const tickerText = useMemo(() => {
    return normalizeTicker(news, String(CFG.defaultTicker || "T.Group • Atualizações ao vivo •"));
  }, [news, CFG.defaultTicker]);

  const marqueeDurationSec = useMemo(() => {
    // mais lento (pedido). Ajusta conforme tamanho do texto
    const len = tickerText.length;
    const raw = 55 + Math.round(len / 30) * 10; // cresce a cada ~30 chars
    return clamp(raw, 60, 140);
  }, [tickerText]);

  async function onEnterFullscreen() {
    try {
      const el = document.documentElement as any;
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    } catch {}
  }

  function Logo({ src, alt }: { src?: string; alt: string }) {
    if (!src) return null;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        style={{
          height: 26,
          width: "auto",
          display: "block",
          filter: "drop-shadow(0 10px 24px rgba(0,0,0,0.35))",
        }}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }

  const groupLogo =
    CFG?.logos?.tgroup ||
    CFG?.tgroupLogo ||
    CFG?.logoSrc ||
    CFG?.groupLogo ||
    undefined;

  const brandTabs = Array.isArray(CFG.brandTabs) ? CFG.brandTabs : [];

  // weather premium (arrays)
  const hourly = Array.isArray(weather?.hourly) ? weather!.hourly!.slice(0, 8) : [];
  const daily = Array.isArray(weather?.daily) ? weather!.daily!.slice(0, 6) : [];

  return (
    <div className="tg_root">
      <div className="tg_backdrop" />

      {/* TOP HUD */}
      <div className="tg_top">
        <div className="tg_brand">
          <div className="tg_mark">
            <Logo src={groupLogo} alt="T.Group" />
            {!groupLogo ? <div className="tg_fallbackMark">T</div> : null}
          </div>
          <div className="tg_brandText">
            <div className="tg_company">{CFG.companyName || "T.Group"}</div>
            <div className="tg_sub">TV Signage • {locationLine}</div>
          </div>
        </div>

        <div className="tg_tabs">
          {brandTabs.map((b: any) => (
            <div key={b.id || b.label} className="tg_tab">
              <Logo src={b.logo} alt={b.label || "Brand"} />
              <span>{b.label}</span>
            </div>
          ))}
        </div>

        <div className="tg_clock">
          <div className="tg_time">{formatTimePtBR(now)}</div>
          <div className="tg_date">{formatDatePtBR(now)}</div>
        </div>
      </div>

      {/* TV actions */}
      {tvMode ? (
        <div className="tg_tvHud">
          <div className="tg_pill">
            TV • {formatTimePtBR(now)} • Sync {lastSync ? formatTimePtBR(lastSync) : "—"}
          </div>
          <button className="tg_btn" onClick={onEnterFullscreen} type="button">
            Tela cheia
          </button>
        </div>
      ) : null}

      {/* STAGE */}
      <div className="tg_stage">
        {/* Scene 0: Welcome premium */}
        <div className={`tg_scene ${scene === 0 ? "isActive" : ""}`}>
          <div className="tg_sceneInner">
            <div className="tg_bigTitle">Bem-vindas, vindes e vindos ao T.Group</div>

            <div className="tg_bigSub">
              {locationLine} • {weather ? `Clima agora: ${tempLabel}` : "Painel ao vivo"}
            </div>

            <div className="tg_manifesto">
              <div className="tg_manifestoChip">Sobre a gente</div>
              <div className="tg_manifestoLine">{manifestoLines[manifestoIndex] || manifestoLines[0]}</div>
            </div>
          </div>
        </div>

        {/* Scene 1: Birthdays */}
        <div className={`tg_scene ${scene === 1 ? "isActive" : ""}`}>
          <div className="tg_sceneInner">
            <div className="tg_bigTitle">
              {birthdaysToday.length ? "Aniversários de hoje" : `Aniversários de ${formatMonthPtBR(monthIndex)}`}
            </div>

            {birthdaysToday.length ? (
              <div className="tg_bdayGrid">
                {birthdaysToday.slice(0, 6).map((p, i) => (
                  <div key={`${p.src}-${i}`} className="tg_bdayCard">
                    <div className="tg_bdayBg" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="tg_bdayImg" src={p.src} alt={p.label || "Aniversariante"} />
                    {p.label ? <div className="tg_bdayCaption">{p.label}</div> : null}
                  </div>
                ))}
              </div>
            ) : birthdaysThisMonth.length ? (
              <div className="tg_bdayMonth">
                <div className="tg_bdayPair">
                  {monthCarouselPair.map((p, i) => (
                    <div key={`${p.src}-${i}`} className="tg_bdayCard tg_bdayCardSmall">
                      <div className="tg_bdayBg" />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="tg_bdayImg" src={p.src} alt={p.label || "Aniversariante do mês"} />
                      {p.label ? <div className="tg_bdayCaption">{p.label}</div> : null}
                    </div>
                  ))}
                </div>

                <div className="tg_bdayList">
                  <div className="tg_bdayListTitle">Lista do mês</div>
                  <div className="tg_bdayListItems">
                    {birthdaysThisMonth.slice(0, 12).map((p, idx) => (
                      <div key={`${p.src}-${idx}`} className="tg_bdayListRow">
                        <span className="tg_dot" />
                        <span className="tg_bdayListName">{p.label || "Aniversariante"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="tg_placeholder">
                <div className="tg_bigSub">Sem aniversariantes configurados para este mês ainda.</div>
              </div>
            )}
          </div>
        </div>

        {/* Scene 2: Weather premium */}
        <div className={`tg_scene ${scene === 2 ? "isActive" : ""}`}>
          <div className="tg_sceneInner">
            <div className="tg_bigTitle">Clima</div>

            <div className="tg_weatherTop">
              <div className="tg_weatherNow">
                <div className="tg_weatherIcon">{weather?.emoji || "⛅️"}</div>
                <div className="tg_weatherMeta">
                  <div className="tg_weatherTemp">{tempLabel}</div>
                  <div className="tg_weatherDesc">{weather?.description || weather?.condition || "São Paulo"}</div>
                </div>
              </div>

              <div className="tg_weatherRight">
                <div className="tg_weatherRightTitle">Próximos dias</div>
                <div className="tg_weatherDaily">
                  {(daily.length ? daily : new Array(5).fill(null)).slice(0, 5).map((d: any, idx) => {
                    const label =
                      d?.date
                        ? new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit" }).format(new Date(d.date))
                        : ["seg", "ter", "qua", "qui", "sex"][idx] || "—";
                    const min = d?.minC != null ? `${Math.round(d.minC)}°` : "—";
                    const max = d?.maxC != null ? `${Math.round(d.maxC)}°` : "—";
                    return (
                      <div key={idx} className="tg_day">
                        <div className="tg_dayTop">
                          <span className="tg_dayLabel">{label}</span>
                          <span className="tg_dayEmoji">{d?.emoji || "⛅️"}</span>
                        </div>
                        <div className="tg_dayTemps">
                          <span className="tg_min">{min}</span>
                          <span className="tg_bar" />
                          <span className="tg_max">{max}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="tg_weatherBottom">
              <div className="tg_weatherRightTitle">Hoje (próximas horas)</div>
              <div className="tg_hourly">
                {(hourly.length ? hourly : new Array(8).fill(null)).slice(0, 8).map((h: any, idx) => {
                  const t =
                    h?.time
                      ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(h.time))
                      : `${pad2((now.getHours() + idx) % 24)}:00`;

                  const tC = Number(h?.tempC ?? h?.temp ?? h?.temperature ?? NaN);
                  const lab = Number.isFinite(tC) ? `${Math.round(tC)}°` : "—";

                  return (
                    <div key={idx} className="tg_hour">
                      <div className="tg_hourTime">{t}</div>
                      <div className="tg_hourEmoji">{h?.emoji || "⛅️"}</div>
                      <div className="tg_hourTemp">{lab}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Scene 3: News */}
        <div className={`tg_scene ${scene === 3 ? "isActive" : ""}`}>
          <div className="tg_sceneInner">
            <div className="tg_bigTitle">News</div>

            <div className="tg_newsGrid">
              {(news.length ? news : [{ title: "Carregando notícias…", source: "—" }]).slice(0, 8).map((it, i) => {
                const domain = domainFromUrl(it.url) || (it.source ? String(it.source) : "");
                const fav = faviconFor(domain);

                return (
                  <div key={`${it.title}-${i}`} className="tg_newsCard">
                    <div className="tg_newsMedia">
                      <div className="tg_newsMediaBg" />
                      {/* fallback favicon */}
                      {fav ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          className="tg_newsFavicon"
                          src={fav}
                          alt={domain || "site"}
                          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                        />
                      ) : null}

                      {/* thumbnail se existir */}
                      {it.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          className="tg_newsThumb"
                          src={it.image}
                          alt={it.title}
                          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                        />
                      ) : null}
                    </div>

                    <div className="tg_newsBody">
                      <div className="tg_newsTitle">{it.title}</div>
                      <div className="tg_newsMeta">{it.source || domain || "—"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Scene 4: Chegadas do mês */}
        {hasWelcomersThisMonth ? (
          <div className={`tg_scene ${scene === 4 ? "isActive" : ""}`}>
            <div className="tg_sceneInner tg_welcome">
              <div className="tg_welcomeHeader">
                <div className="tg_welcomeTitle">Chegadas do mês</div>
                <div className="tg_welcomeSub">{formatMonthPtBR(monthIndex)} • nova energia no ar ✨</div>
              </div>

              <div
                className="tg_welcomeGrid"
                style={{
                  gridTemplateColumns: `repeat(${Math.min(4, Math.max(2, welcomeCards.length))}, minmax(0, 1fr))`,
                }}
              >
                {welcomeCards.map((c, idx) => (
                  <div key={`${c.src}-${idx}`} className="tg_welcomeCard" style={{ animationDelay: `${idx * 160}ms` }}>
                    <div className="tg_welcomeGlow" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="tg_welcomeImg" src={c.src} alt={c.label || "Chegada do mês"} />
                    {c.label ? <div className="tg_welcomeCaption">{c.label}</div> : null}
                  </div>
                ))}
              </div>

              {/* pedido: remover dicas */}
            </div>
          </div>
        ) : null}
      </div>

      {/* Footer premium */}
      <div className="tg_bottom">
        <div className="tg_footer">
          <div className="tg_live">
            <span className="tg_liveDot" />
            <span className="tg_liveTxt">AO VIVO</span>
          </div>

          <div className="tg_ticker" style={{ ["--marqueeDur" as any]: `${marqueeDurationSec}s` }}>
            <div className="tg_tickerTrack">
              <span>{tickerText}</span>
              <span>{tickerText}</span>
            </div>
            <div className="tg_tickerFade tg_leftFade" />
            <div className="tg_tickerFade tg_rightFade" />
          </div>

          <div className="tg_footerMeta">
            <span className="tg_metaChip">{tempLabel}</span>
            <span className="tg_metaChip">{locationLine}</span>
          </div>
        </div>
      </div>

      <MusicDock />

      <style jsx global>{`
        .tg_root {
          position: relative;
          min-height: 100vh;
          width: 100%;
          overflow: hidden;
          background: #07090f;
          color: #fff;
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        }

        /* BACKDROP */
        .tg_backdrop {
          position: absolute;
          inset: -40%;
          background:
            radial-gradient(60% 50% at 20% 20%, rgba(64, 120, 255, 0.35), transparent 60%),
            radial-gradient(55% 45% at 70% 25%, rgba(20, 240, 220, 0.25), transparent 60%),
            radial-gradient(60% 55% at 70% 70%, rgba(255, 60, 60, 0.25), transparent 60%),
            radial-gradient(40% 50% at 30% 70%, rgba(160, 120, 255, 0.18), transparent 60%),
            linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.85));
          filter: blur(28px) saturate(115%);
          animation: tg_drift 18s ease-in-out infinite alternate;
        }
        @keyframes tg_drift {
          from { transform: translate3d(-1%, -1%, 0) scale(1.02); }
          to   { transform: translate3d( 1%,  1%, 0) scale(1.04); }
        }

        /* TOP HUD */
        .tg_top {
          position: relative;
          z-index: 20;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 18px;
          padding: 24px 28px;
        }

        .tg_brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .tg_mark {
          height: 44px; width: 44px;
          border-radius: 16px;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.12);
          display: grid; place-items: center;
          overflow: hidden;
          box-shadow: 0 24px 80px rgba(0,0,0,0.45);
        }
        .tg_fallbackMark { font-weight: 900; font-size: 18px; opacity: 0.9; }
        .tg_brandText { min-width: 0; }
        .tg_company { font-weight: 900; letter-spacing: -0.02em; font-size: 18px; }
        .tg_sub { opacity: 0.7; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .tg_tabs { display: flex; gap: 10px; justify-content: center; }
        .tg_tab {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 12px;
          border-radius: 999px;
          background: rgba(0,0,0,0.25);
          border: 1px solid rgba(255,255,255,0.10);
          backdrop-filter: blur(10px);
          font-size: 11px;
          letter-spacing: 0.20em;
          text-transform: uppercase;
          opacity: 0.9;
        }
        .tg_tab img { height: 16px; }

        .tg_clock { text-align: right; }
        .tg_time { font-size: 54px; font-weight: 950; letter-spacing: -0.04em; line-height: 1; }
        .tg_date { opacity: 0.75; font-size: 14px; text-transform: lowercase; }

        /* TV HUD */
        .tg_tvHud {
          position: absolute;
          top: 92px;
          right: 28px;
          z-index: 25;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .tg_pill {
          padding: 10px 12px;
          border-radius: 999px;
          background: rgba(0,0,0,0.45);
          border: 1px solid rgba(255,255,255,0.12);
          font-size: 12px;
          opacity: 0.9;
          backdrop-filter: blur(10px);
        }
        .tg_btn {
          padding: 10px 12px;
          border-radius: 14px;
          background: rgba(255,255,255,0.92);
          color: #111;
          border: none;
          font-weight: 950;
          cursor: pointer;
        }

        /* STAGE + SCENES */
        .tg_stage {
          position: relative;
          z-index: 10;
          margin: 0 28px;
          border-radius: 28px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(0,0,0,0.35);
          backdrop-filter: blur(18px);
          box-shadow: 0 30px 120px rgba(0,0,0,0.55);
          overflow: hidden;
          min-height: 64vh;
        }

        .tg_scene {
          position: absolute;
          inset: 0;
          opacity: 0;
          transform: scale(1.01);
          transition: opacity 700ms ease, transform 700ms ease;
          display: flex;
        }
        .tg_scene.isActive {
          opacity: 1;
          transform: scale(1.00);
        }

        .tg_sceneInner {
          padding: 34px;
          width: 100%;
        }

        .tg_bigTitle {
          font-size: 68px;
          font-weight: 980;
          letter-spacing: -0.05em;
          line-height: 0.95;
          text-shadow: 0 24px 70px rgba(0,0,0,0.55);
        }

        .tg_bigSub {
          margin-top: 10px;
          font-size: 16px;
          opacity: 0.82;
          max-width: 1050px;
        }

        /* Home manifesto */
        .tg_manifesto {
          margin-top: 22px;
          max-width: 1100px;
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.06);
          padding: 18px 18px;
          box-shadow: 0 26px 110px rgba(0,0,0,0.45);
        }
        .tg_manifestoChip {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(0,0,0,0.32);
          font-weight: 900;
          letter-spacing: 0.18em;
          font-size: 11px;
          text-transform: uppercase;
          opacity: 0.92;
        }
        .tg_manifestoLine {
          margin-top: 12px;
          font-size: 28px;
          font-weight: 900;
          letter-spacing: -0.03em;
          opacity: 0.95;
        }

        /* Birthdays */
        .tg_bdayGrid {
          margin-top: 18px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }

        .tg_bdayMonth {
          margin-top: 18px;
          display: grid;
          grid-template-columns: 1.3fr 0.7fr;
          gap: 16px;
          align-items: stretch;
        }

        .tg_bdayPair {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .tg_bdayCard {
          position: relative;
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.06);
          overflow: hidden;
          min-height: 34vh;
          box-shadow: 0 34px 120px rgba(0,0,0,0.55);
          backdrop-filter: blur(12px);
        }
        .tg_bdayCardSmall { min-height: 40vh; }

        .tg_bdayBg {
          position: absolute;
          inset: -30%;
          background:
            radial-gradient(40% 35% at 20% 25%, rgba(120, 160, 255, 0.25), transparent 65%),
            radial-gradient(40% 35% at 80% 30%, rgba(20, 240, 220, 0.18), transparent 65%),
            radial-gradient(40% 35% at 70% 80%, rgba(255, 90, 90, 0.18), transparent 65%);
          filter: blur(16px);
          opacity: 0.85;
          pointer-events: none;
        }

        .tg_bdayImg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: contain; /* pedido: sem estourar/crop */
          padding: 12px;
          display: block;
        }

        .tg_bdayCaption {
          position: absolute;
          left: 14px;
          right: 14px;
          bottom: 12px;
          padding: 10px 12px;
          border-radius: 16px;
          background: rgba(0,0,0,0.45);
          border: 1px solid rgba(255,255,255,0.10);
          backdrop-filter: blur(10px);
          font-weight: 950;
          letter-spacing: -0.01em;
          font-size: 14px;
        }

        .tg_bdayList {
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(0,0,0,0.28);
          padding: 16px;
          overflow: hidden;
        }
        .tg_bdayListTitle {
          font-weight: 950;
          letter-spacing: -0.02em;
          font-size: 16px;
          opacity: 0.95;
        }
        .tg_bdayListItems {
          margin-top: 12px;
          display: grid;
          gap: 10px;
        }
        .tg_bdayListRow {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.06);
        }
        .tg_dot {
          height: 8px; width: 8px;
          border-radius: 999px;
          background: rgba(255,255,255,0.85);
          box-shadow: 0 10px 30px rgba(0,0,0,0.45);
          flex: 0 0 auto;
        }
        .tg_bdayListName { opacity: 0.95; }

        .tg_placeholder {
          margin-top: 18px;
          padding: 18px;
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.06);
          max-width: 980px;
        }

        /* Weather */
        .tg_weatherTop {
          margin-top: 14px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          align-items: stretch;
        }

        .tg_weatherNow {
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.06);
          padding: 18px;
          display: flex;
          align-items: center;
          gap: 16px;
          min-height: 22vh;
          box-shadow: 0 34px 120px rgba(0,0,0,0.45);
        }
        .tg_weatherIcon {
          font-size: 70px;
          filter: drop-shadow(0 18px 40px rgba(0,0,0,0.5));
        }
        .tg_weatherTemp {
          font-size: 66px;
          font-weight: 980;
          letter-spacing: -0.04em;
          line-height: 1;
        }
        .tg_weatherDesc {
          margin-top: 6px;
          opacity: 0.82;
          font-size: 16px;
        }

        .tg_weatherRight {
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(0,0,0,0.28);
          padding: 18px;
          box-shadow: 0 34px 120px rgba(0,0,0,0.45);
        }

        .tg_weatherRightTitle {
          font-weight: 950;
          letter-spacing: -0.02em;
          font-size: 16px;
          opacity: 0.95;
        }

        .tg_weatherDaily {
          margin-top: 12px;
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 10px;
        }

        .tg_day {
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.06);
          padding: 12px;
        }

        .tg_dayTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .tg_dayLabel { opacity: 0.9; font-weight: 900; text-transform: lowercase; }
        .tg_dayEmoji { font-size: 18px; }

        .tg_dayTemps {
          margin-top: 10px;
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 950;
        }
        .tg_min { opacity: 0.82; }
        .tg_max { opacity: 0.98; }
        .tg_bar {
          flex: 1 1 auto;
          height: 2px;
          border-radius: 999px;
          background: rgba(255,255,255,0.18);
        }

        .tg_weatherBottom {
          margin-top: 16px;
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.06);
          padding: 16px;
          box-shadow: 0 34px 120px rgba(0,0,0,0.35);
        }

        .tg_hourly {
          margin-top: 12px;
          display: grid;
          grid-template-columns: repeat(8, minmax(0, 1fr));
          gap: 10px;
        }

        .tg_hour {
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.25);
          padding: 12px 10px;
          text-align: center;
        }
        .tg_hourTime { opacity: 0.8; font-weight: 900; }
        .tg_hourEmoji { margin-top: 6px; font-size: 20px; }
        .tg_hourTemp { margin-top: 6px; font-weight: 980; font-size: 18px; }

        /* News */
        .tg_newsGrid {
          margin-top: 18px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
          max-width: 1200px;
        }
        .tg_newsCard {
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.06);
          overflow: hidden;
          display: grid;
          grid-template-columns: 210px 1fr;
          min-height: 120px;
        }
        .tg_newsMedia {
          position: relative;
          overflow: hidden;
        }
        .tg_newsMediaBg {
          position: absolute;
          inset: 0;
          background: radial-gradient(70% 70% at 20% 30%, rgba(120,160,255,0.20), transparent 60%),
                      radial-gradient(70% 70% at 80% 70%, rgba(255,90,90,0.18), transparent 60%),
                      rgba(0,0,0,0.35);
        }
        .tg_newsFavicon {
          position: absolute;
          left: 16px;
          top: 16px;
          width: 28px;
          height: 28px;
          border-radius: 10px;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.12);
          padding: 6px;
          backdrop-filter: blur(10px);
          z-index: 2;
        }
        .tg_newsThumb {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          z-index: 1;
        }
        .tg_newsBody {
          padding: 14px 16px;
          display: grid;
          gap: 10px;
          align-content: center;
        }
        .tg_newsTitle {
          font-weight: 950;
          letter-spacing: -0.02em;
          font-size: 16px;
          line-height: 1.2;
          opacity: 0.96;
        }
        .tg_newsMeta {
          opacity: 0.78;
          font-size: 12px;
          text-transform: lowercase;
        }

        /* Welcome scene */
        .tg_welcomeHeader {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 18px;
        }
        .tg_welcomeTitle {
          font-size: 56px;
          font-weight: 980;
          letter-spacing: -0.05em;
          line-height: 1;
          text-shadow: 0 24px 70px rgba(0,0,0,0.55);
        }
        .tg_welcomeSub {
          opacity: 0.82;
          font-size: 14px;
          text-transform: lowercase;
          white-space: nowrap;
        }

        .tg_welcomeGrid {
          display: grid;
          gap: 14px;
          align-items: stretch;
          margin-top: 10px;
        }

        .tg_welcomeCard {
          position: relative;
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.06);
          overflow: hidden;
          min-height: 34vh; /* menor (pedido) */
          box-shadow: 0 30px 120px rgba(0,0,0,0.50);
          transform: translateY(10px) scale(0.99);
          opacity: 0;
          animation: tg_welcomeIn 800ms ease forwards, tg_cardFloat 6.5s ease-in-out infinite alternate;
          backdrop-filter: blur(14px);
        }

        @keyframes tg_welcomeIn {
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes tg_cardFloat {
          from { transform: translateY(0) scale(1); }
          to   { transform: translateY(-6px) scale(1.01); }
        }

        .tg_welcomeGlow {
          position: absolute;
          inset: -40%;
          background:
            radial-gradient(35% 35% at 20% 30%, rgba(255, 120, 60, 0.30), transparent 65%),
            radial-gradient(35% 35% at 75% 25%, rgba(120, 160, 255, 0.22), transparent 65%),
            radial-gradient(35% 35% at 70% 80%, rgba(20, 240, 220, 0.16), transparent 65%);
          filter: blur(18px);
          opacity: 0.9;
          pointer-events: none;
        }

        .tg_welcomeImg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: contain;
          padding: 12px;
          display: block;
        }

        .tg_welcomeCaption {
          position: absolute;
          left: 14px;
          right: 14px;
          bottom: 12px;
          padding: 10px 12px;
          border-radius: 16px;
          background: rgba(0,0,0,0.45);
          border: 1px solid rgba(255,255,255,0.10);
          backdrop-filter: blur(10px);
          font-weight: 950;
          letter-spacing: -0.01em;
          font-size: 14px;
        }

        /* Footer premium */
        .tg_bottom {
          position: relative;
          z-index: 15;
          padding: 14px 28px 24px;
        }

        .tg_footer {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 12px;
          align-items: center;
          padding: 12px 14px;
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(0,0,0,0.42);
          backdrop-filter: blur(12px);
          box-shadow: 0 26px 110px rgba(0,0,0,0.55);
          position: relative;
          overflow: hidden;
        }

        .tg_footer::before {
          content: "";
          position: absolute;
          inset: -30%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
          transform: rotate(8deg);
          animation: tg_footerShine 7.5s ease-in-out infinite;
          pointer-events: none;
          opacity: 0.8;
        }
        @keyframes tg_footerShine {
          from { transform: translateX(-10%) rotate(8deg); }
          to   { transform: translateX(10%) rotate(8deg); }
        }

        .tg_live {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.06);
          font-weight: 950;
          letter-spacing: 0.18em;
          font-size: 11px;
          text-transform: uppercase;
          position: relative;
          z-index: 1;
        }
        .tg_liveDot {
          height: 10px;
          width: 10px;
          border-radius: 999px;
          background: rgba(255, 80, 80, 0.95);
          box-shadow: 0 0 0 6px rgba(255, 80, 80, 0.14);
          animation: tg_pulse 1.3s ease-in-out infinite;
        }
        @keyframes tg_pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.85; }
        }

        .tg_ticker {
          position: relative;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.35);
          overflow: hidden;
          backdrop-filter: blur(10px);
          z-index: 1;
        }

        .tg_tickerTrack {
          display: inline-flex;
          gap: 56px;
          white-space: nowrap;
          padding: 12px 18px;
          animation: tg_marquee var(--marqueeDur, 90s) linear infinite; /* pedido: mais devagar */
          font-size: 14px;
          opacity: 0.92;
          will-change: transform;
        }
        @keyframes tg_marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }

        .tg_tickerFade {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 70px;
          pointer-events: none;
        }
        .tg_leftFade {
          left: 0;
          background: linear-gradient(90deg, rgba(0,0,0,0.65), transparent);
        }
        .tg_rightFade {
          right: 0;
          background: linear-gradient(270deg, rgba(0,0,0,0.65), transparent);
        }

        .tg_footerMeta {
          display: inline-flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          position: relative;
          z-index: 1;
        }
        .tg_metaChip {
          padding: 10px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.06);
          font-size: 12px;
          opacity: 0.88;
          white-space: nowrap;
        }

        /* Responsive */
        @media (max-width: 980px) {
          .tg_time { font-size: 44px; }
          .tg_bigTitle { font-size: 46px; }
          .tg_tabs { display: none; }
          .tg_footerMeta { display: none; }
          .tg_manifestoLine { font-size: 18px; }
          .tg_newsCard { grid-template-columns: 160px 1fr; }
          .tg_weatherTop { grid-template-columns: 1fr; }
          .tg_weatherDaily { grid-template-columns: repeat(5, minmax(0, 1fr)); }
          .tg_hourly { grid-template-columns: repeat(4, minmax(0, 1fr)); }
          .tg_bdayGrid { grid-template-columns: 1fr; }
          .tg_bdayMonth { grid-template-columns: 1fr; }
          .tg_bdayPair { grid-template-columns: 1fr; }
        }

        @media (prefers-reduced-motion: reduce) {
          .tg_backdrop,
          .tg_tickerTrack,
          .tg_footer::before,
          .tg_liveDot,
          .tg_welcomeCard {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
