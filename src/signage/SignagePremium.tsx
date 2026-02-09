// src/signage/SignagePremium.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { SIGNAGE_CONFIG } from "@/config";
import MusicDock from "@/components/MusicDock";

function pad2(n: number) {
  return String(n).padStart(2, "0");
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

function formatMonthPtBR(monthIndex: number, year: number) {
  const d = new Date(year, monthIndex, 1);
  return new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(d);
}

type WeatherLike = {
  ok?: boolean;
  tempC?: number;
  temp?: number;
  temperature?: number;
  description?: string;
  condition?: string;
  icon?: string;
  emoji?: string;
};

function safeHeadlines(payload: any): string[] {
  const items = payload?.items || payload?.news || payload?.articles || payload?.headlines || [];
  if (Array.isArray(items)) {
    return items
      .map((x) => (typeof x === "string" ? x : x?.title))
      .filter(Boolean)
      .slice(0, 10);
  }
  return [];
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function readTempC(weather: WeatherLike | null): number | null {
  if (!weather) return null;
  const v = Number(weather.tempC ?? weather.temp ?? weather.temperature ?? NaN);
  return Number.isFinite(v) ? v : null;
}

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export default function SignagePremium() {
  const [now, setNow] = useState(() => new Date());
  const [scene, setScene] = useState(0);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const [weather, setWeather] = useState<WeatherLike | null>(null);
  const [headlines, setHeadlines] = useState<string[]>([]);

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
  const year = now.getFullYear();

  // clock tick
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ===== Fetch WEATHER (separado) =====
  useEffect(() => {
    let alive = true;

    async function refreshWeather() {
      try {
        const res = await fetch("/api/weather", { cache: "no-store" });
        const json = await safeJson(res);
        if (!alive) return;

        if (res.ok) {
          setWeather((json as WeatherLike) || null);
        } else {
          // mantém UI estável: se der erro, não “zera” tudo agressivo
          setWeather((prev) => prev ?? null);
        }

        setLastSync(new Date());
      } catch {
        if (!alive) return;
        setLastSync(new Date());
      }
    }

    void refreshWeather();

    const wt = setInterval(
      refreshWeather,
      Number.isFinite(Number(SIGNAGE_CONFIG.refreshWeatherMs))
        ? Number(SIGNAGE_CONFIG.refreshWeatherMs)
        : 10 * 60 * 1000
    );

    return () => {
      alive = false;
      clearInterval(wt);
    };
  }, []);

  // ===== Fetch NEWS (separado) =====
  useEffect(() => {
    let alive = true;

    async function refreshNews() {
      try {
        const res = await fetch("/api/news", { cache: "no-store" });
        const json = await safeJson(res);
        if (!alive) return;

        if (res.ok) {
          setHeadlines(safeHeadlines(json));
        } else {
          setHeadlines((prev) => prev ?? []);
        }

        setLastSync(new Date());
      } catch {
        if (!alive) return;
        setLastSync(new Date());
      }
    }

    void refreshNews();

    const nt = setInterval(
      refreshNews,
      Number.isFinite(Number(SIGNAGE_CONFIG.refreshNewsMs))
        ? Number(SIGNAGE_CONFIG.refreshNewsMs)
        : 20 * 60 * 1000
    );

    return () => {
      alive = false;
      clearInterval(nt);
    };
  }, []);

  // ===== Wake Lock (best-effort + re-lock on visibility) =====
  useEffect(() => {
    let cancelled = false;

    async function lock() {
      try {
        // @ts-ignore
        if (!tvMode) return;
        // @ts-ignore
        if (!("wakeLock" in navigator)) return;
        // @ts-ignore
        const wl = await navigator.wakeLock.request("screen");
        if (cancelled) return;
        wakeLockRef.current = wl;
      } catch {
        // ignore
      }
    }

    function onVisibility() {
      if (!tvMode) return;
      if (document.visibilityState === "visible") {
        void lock();
      }
    }

    void lock();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      try {
        wakeLockRef.current?.release?.();
      } catch {}
    };
  }, [tvMode]);

  // ===== Birthdays (robusto: casa mmdd e ddmm) =====
  const birthdayPoster = useMemo(() => {
    const mmddKey = `${pad2(monthIndex + 1)}${pad2(now.getDate())}`; // mmdd
    const ddmmKey = `${pad2(now.getDate())}${pad2(monthIndex + 1)}`; // ddmm

    const list = SIGNAGE_CONFIG.birthdayPosters || [];

    const exact =
      list.find((x) => x.mmdd === mmddKey) ||
      list.find((x) => x.mmdd === ddmmKey);

    if (exact) return exact;

    // Sem aniversariante no dia → faz rotação do mês
    const monthList = list.filter((x) => x.mmdd.startsWith(monthKey) || x.mmdd.endsWith(monthKey));
    if (monthList.length) {
      const i = Math.floor((now.getTime() / (SIGNAGE_CONFIG.sceneDurationMs || 14000)) % monthList.length);
      return monthList[i];
    }

    return null;
  }, [monthIndex, monthKey, now]);

  // ===== Welcomers (chegadas do mês) =====
  const welcomeMonthList = useMemo(() => {
    const list = SIGNAGE_CONFIG.welcomePosters || [];
    return list.filter((x) => x.mm === monthKey);
  }, [monthKey]);

  const welcomeCards = useMemo(() => {
    if (!welcomeMonthList.length) return [];
    const max = 2;
    const start = Math.floor((now.getTime() / (SIGNAGE_CONFIG.sceneDurationMs || 14000)) % welcomeMonthList.length);
    const out: typeof welcomeMonthList = [];
    for (let i = 0; i < Math.min(max, welcomeMonthList.length); i++) {
      out.push(welcomeMonthList[(start + i) % welcomeMonthList.length]);
    }
    return out;
  }, [welcomeMonthList, now]);

  const hasWelcomersThisMonth = welcomeMonthList.length > 0;

  // rotate scenes
  useEffect(() => {
    const ms = clamp(Number(SIGNAGE_CONFIG.sceneDurationMs || 14000), 7000, 60000);
    const sceneCount = hasWelcomersThisMonth ? 5 : 4;

    const t = setInterval(() => setScene((s) => (s + 1) % sceneCount), ms);
    return () => clearInterval(t);
  }, [hasWelcomersThisMonth]);

  const tickerText = useMemo(() => {
    const t = headlines.length ? headlines.join(" • ") : SIGNAGE_CONFIG.defaultTicker;
    return t.endsWith("•") ? t : `${t} •`;
  }, [headlines]);

  async function onEnterFullscreen() {
    try {
      const el = document.documentElement as any;
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    } catch {
      // TVs variam
    }
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

  const tempC = readTempC(weather);
  const tempLabel = tempC == null ? "—" : `${Math.round(tempC)}°C`;

  return (
    <div className="tg_root">
      <div className="tg_backdrop" />

      {/* HUD TOP */}
      <div className="tg_top">
        <div className="tg_brand">
          <div className="tg_mark">
            <Logo src={SIGNAGE_CONFIG.logos?.tgroup} alt="T.Group" />
            {!SIGNAGE_CONFIG.logos?.tgroup ? <div className="tg_fallbackMark">T</div> : null}
          </div>
          <div className="tg_brandText">
            <div className="tg_company">{SIGNAGE_CONFIG.companyName}</div>
            <div className="tg_sub">TV Signage • {SIGNAGE_CONFIG.locationLabel}</div>
          </div>
        </div>

        <div className="tg_tabs">
          {(SIGNAGE_CONFIG.brandTabs || []).map((b) => (
            <div key={b.id} className="tg_tab">
              <Logo src={b.logo} alt={b.label} />
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
        {/* Scene 0: Hero */}
        <div className={`tg_scene ${scene === 0 ? "isActive" : ""}`}>
          <div className="tg_sceneInner">
            <div className="tg_bigTitle">Bem-vindos</div>
            <div className="tg_bigSub">
              {SIGNAGE_CONFIG.locationLabel} • {weather ? "Clima ao vivo" : "Painel ao vivo"} • {tempLabel}
            </div>

            <div className="tg_kpis">
              <div className="tg_kpi">
                <div className="tg_kpiLabel">Agora</div>
                <div className="tg_kpiValue">{formatTimePtBR(now)}</div>
              </div>
              <div className="tg_kpi">
                <div className="tg_kpiLabel">Local</div>
                <div className="tg_kpiValue">SP</div>
              </div>
              <div className="tg_kpi">
                <div className="tg_kpiLabel">Status</div>
                <div className="tg_kpiValue">ON</div>
              </div>
            </div>

            {tvMode ? (
              <div className="tg_hint">
                Dica: mantenha a TV em “Tela cheia”. O som pode precisar de 1 OK em “Ativar som”.
              </div>
            ) : null}
          </div>
        </div>

        {/* Scene 1: Birthdays poster full-screen */}
        <div className={`tg_scene ${scene === 1 ? "isActive" : ""}`}>
          <div className="tg_sceneInner tg_fullBleed">
            {birthdayPoster?.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="tg_poster" src={birthdayPoster.src} alt={`Aniversário ${birthdayPoster.label || ""}`} />
            ) : (
              <div className="tg_placeholder">
                <div className="tg_bigTitle">Aniversariantes</div>
                <div className="tg_bigSub">Sem pôster configurado para hoje/mês.</div>
              </div>
            )}
          </div>
        </div>

        {/* Scene 2: Weather */}
        <div className={`tg_scene ${scene === 2 ? "isActive" : ""}`}>
          <div className="tg_sceneInner">
            <div className="tg_bigTitle">Clima</div>
            <div className="tg_weatherRow">
              <div className="tg_weatherIcon">{weather?.emoji || "⛅️"}</div>
              <div className="tg_weatherMeta">
                <div className="tg_weatherTemp">{tempLabel}</div>
                <div className="tg_weatherDesc">{weather?.description || weather?.condition || "São Paulo"}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Scene 3: News */}
        <div className={`tg_scene ${scene === 3 ? "isActive" : ""}`}>
          <div className="tg_sceneInner">
            <div className="tg_bigTitle">Manchetes</div>
            <div className="tg_news">
              {(headlines.length ? headlines : ["Sem manchetes por enquanto — conectando…"])
                .slice(0, 5)
                .map((t, i) => (
                  <div key={i} className="tg_newsItem">
                    <span className="tg_bullet" />
                    <span className="tg_newsText">{t}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* Scene 4: Chegadas do mês */}
        {hasWelcomersThisMonth ? (
          <div className={`tg_scene ${scene === 4 ? "isActive" : ""}`}>
            <div className="tg_sceneInner tg_welcome">
              <div className="tg_welcomeHeader">
                <div className="tg_welcomeTitle">Chegadas do mês</div>
                <div className="tg_welcomeSub">
                  {formatMonthPtBR(monthIndex, year)} • nova energia no ar ✨
                </div>
              </div>

              <div
                className="tg_welcomeGrid"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(1, welcomeCards.length)}, minmax(0, 1fr))`,
                }}
              >
                {welcomeCards.map((c, idx) => (
                  <div key={`${c.src}-${idx}`} className="tg_welcomeCard" style={{ animationDelay: `${idx * 220}ms` }}>
                    <div className="tg_welcomeGlow" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="tg_welcomeImg" src={c.src} alt={c.label || "Chegada do mês"} />
                    {c.label ? <div className="tg_welcomeCaption">{c.label}</div> : null}
                  </div>
                ))}
              </div>

              <div className="tg_welcomeHint">
                Dica GC: quer trocar as artes do mês? Só subir em <span className="tg_code">/public/signage/welcome</span> e atualizar o{" "}
                <span className="tg_code">welcomePosters</span> no config.
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Footer premium */}
      <div className="tg_bottom">
        <div className="tg_footer">
          <div className="tg_live">
            <span className="tg_liveDot" />
            <span className="tg_liveTxt">LIVE</span>
          </div>

          <div className="tg_ticker">
            <div className="tg_tickerTrack">
              <span>{tickerText}</span>
              <span>{tickerText}</span>
            </div>
            <div className="tg_tickerFade tg_leftFade" />
            <div className="tg_tickerFade tg_rightFade" />
          </div>

          <div className="tg_footerMeta">
            <span className="tg_metaChip">{tempLabel}</span>
            <span className="tg_metaChip">{SIGNAGE_CONFIG.locationLabel}</span>
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
        .tg_time { font-size: 54px; font-weight: 900; letter-spacing: -0.04em; line-height: 1; }
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
          font-weight: 900;
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

        .tg_fullBleed { padding: 0; }
        .tg_poster {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .tg_bigTitle {
          font-size: 72px;
          font-weight: 950;
          letter-spacing: -0.05em;
          line-height: 0.95;
          text-shadow: 0 24px 70px rgba(0,0,0,0.55);
        }

        .tg_bigSub {
          margin-top: 10px;
          font-size: 16px;
          opacity: 0.78;
          max-width: 900px;
        }

        .tg_kpis {
          margin-top: 22px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          max-width: 980px;
        }
        .tg_kpi {
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.06);
          padding: 16px 16px;
        }
        .tg_kpiLabel {
          font-size: 11px;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          opacity: 0.7;
        }
        .tg_kpiValue {
          font-size: 34px;
          font-weight: 900;
          margin-top: 4px;
        }

        .tg_hint {
          margin-top: 16px;
          font-size: 12px;
          opacity: 0.7;
        }

        /* Weather */
        .tg_weatherRow {
          margin-top: 22px;
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .tg_weatherIcon {
          font-size: 64px;
          filter: drop-shadow(0 18px 40px rgba(0,0,0,0.5));
        }
        .tg_weatherTemp {
          font-size: 56px;
          font-weight: 950;
          letter-spacing: -0.03em;
          line-height: 1;
        }
        .tg_weatherDesc {
          margin-top: 6px;
          opacity: 0.78;
        }

        /* News */
        .tg_news {
          margin-top: 18px;
          display: grid;
          gap: 12px;
          max-width: 1100px;
        }
        .tg_newsItem {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 14px 16px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.06);
        }
        .tg_bullet {
          height: 10px;
          width: 10px;
          border-radius: 999px;
          background: rgba(255,255,255,0.85);
          margin-top: 6px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.45);
          flex: 0 0 auto;
        }
        .tg_newsText {
          font-size: 16px;
          opacity: 0.92;
        }

        /* Welcome scene */
        .tg_welcome { position: relative; }
        .tg_welcomeHeader {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 18px;
        }
        .tg_welcomeTitle {
          font-size: 58px;
          font-weight: 950;
          letter-spacing: -0.05em;
          line-height: 1;
          text-shadow: 0 24px 70px rgba(0,0,0,0.55);
        }
        .tg_welcomeSub {
          opacity: 0.78;
          font-size: 14px;
          text-transform: lowercase;
          white-space: nowrap;
        }

        .tg_welcomeGrid {
          display: grid;
          gap: 18px;
          align-items: stretch;
          margin-top: 10px;
        }

        .tg_welcomeCard {
          position: relative;
          border-radius: 26px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.06);
          overflow: hidden;
          min-height: 46vh;
          box-shadow: 0 36px 140px rgba(0,0,0,0.55);
          transform: translateY(10px) scale(0.99);
          opacity: 0;
          animation: tg_welcomeIn 850ms ease forwards, tg_cardFloat 6.5s ease-in-out infinite alternate;
          backdrop-filter: blur(14px);
        }

        @keyframes tg_welcomeIn { to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes tg_cardFloat {
          from { transform: translateY(0) scale(1); }
          to   { transform: translateY(-8px) scale(1.01); }
        }

        .tg_welcomeGlow {
          position: absolute;
          inset: -40%;
          background:
            radial-gradient(35% 35% at 20% 30%, rgba(255, 120, 60, 0.35), transparent 65%),
            radial-gradient(35% 35% at 75% 25%, rgba(120, 160, 255, 0.25), transparent 65%),
            radial-gradient(35% 35% at 70% 80%, rgba(20, 240, 220, 0.18), transparent 65%);
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
          padding: 10px;
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
          font-weight: 900;
          letter-spacing: -0.01em;
          font-size: 14px;
        }

        .tg_welcomeHint { margin-top: 14px; font-size: 12px; opacity: 0.7; }
        .tg_code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          font-size: 12px;
          padding: 2px 8px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.06);
        }

        /* Footer premium */
        .tg_bottom { position: relative; z-index: 15; padding: 14px 28px 24px; }

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
          font-weight: 900;
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
        .tg_liveTxt { opacity: 0.95; }

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
          animation: tg_marquee 24s linear infinite;
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
        .tg_leftFade { left: 0; background: linear-gradient(90deg, rgba(0,0,0,0.65), transparent); }
        .tg_rightFade { right: 0; background: linear-gradient(270deg, rgba(0,0,0,0.65), transparent); }

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
          .tg_stage { min-height: 62vh; }
          .tg_tabs { display: none; }
          .tg_footerMeta { display: none; }
          .tg_welcomeTitle { font-size: 42px; }
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
