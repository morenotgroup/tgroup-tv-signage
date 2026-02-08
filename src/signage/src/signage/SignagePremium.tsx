"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { SIGNAGE_CONFIG } from "../config";
import MusicDock from "../components/MusicDock";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toMmdd(d: Date) {
  return `${pad2(d.getDate())}${pad2(d.getMonth() + 1)}`; // ddmm
}

// (Você usa mmdd no config como "0302" (03/02) -> aqui vou converter pra isso)
function toMmddConfigKey(d: Date) {
  return `${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`; // mmdd
}

function formatTimePtBR(now: Date) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(now);
}

function formatDatePtBR(now: Date) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(
    now
  );
}

type WeatherLike = {
  tempC?: number;
  temp?: number;
  temperature?: number;
  description?: string;
  condition?: string;
  icon?: string;
  emoji?: string;
};

type NewsLike = { title?: string }[];

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

  // clock tick
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // rotate scenes
  useEffect(() => {
    const ms = clamp(Number(SIGNAGE_CONFIG.sceneDurationMs || 14000), 7000, 60000);
    const t = setInterval(() => setScene((s) => (s + 1) % 4), ms);
    return () => clearInterval(t);
  }, []);

  // wake lock (best-effort)
  useEffect(() => {
    async function lock() {
      try {
        // @ts-ignore
        if ("wakeLock" in navigator && tvMode) {
          // @ts-ignore
          wakeLockRef.current = await navigator.wakeLock.request("screen");
        }
      } catch {
        // ignore (nem toda TV suporta)
      }
    }
    void lock();

    return () => {
      try {
        wakeLockRef.current?.release?.();
      } catch {}
    };
  }, [tvMode]);

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
        if (n.status === "fulfilled") setHeadlines(safeHeadlines(n.value));
        setLastSync(new Date());
      } catch {
        if (!alive) return;
        setLastSync(new Date());
      }
    }

    void refreshAll();

    const wt = setInterval(refreshAll, SIGNAGE_CONFIG.refreshWeatherMs ?? 10 * 60 * 1000);
    const nt = setInterval(refreshAll, SIGNAGE_CONFIG.refreshNewsMs ?? 20 * 60 * 1000);

    return () => {
      alive = false;
      clearInterval(wt);
      clearInterval(nt);
    };
  }, []);

  // birthdays pick
  const birthdayPoster = useMemo(() => {
    const key = toMmddConfigKey(now); // mmdd
    const list = SIGNAGE_CONFIG.birthdayPosters || [];
    const exact = list.find((x) => x.mmdd === key);
    if (exact) return exact;

    // se não tiver aniversariante no dia, mostra “do mês” (rotaciona)
    const month = pad2(now.getMonth() + 1);
    const monthList = list.filter((x) => x.mmdd.startsWith(month));
    if (monthList.length) {
      const i = Math.floor((now.getTime() / (SIGNAGE_CONFIG.sceneDurationMs || 14000)) % monthList.length);
      return monthList[i];
    }

    return null;
  }, [now]);

  const tickerText = useMemo(() => {
    const t = headlines.length ? headlines.join(" • ") : SIGNAGE_CONFIG.defaultTicker;
    return t.endsWith("•") ? t : `${t} •`;
  }, [headlines]);

  async function onEnterFullscreen() {
    try {
      const el = document.documentElement;
      // @ts-ignore
      if (el.requestFullscreen) await el.requestFullscreen();
      // @ts-ignore
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

  return (
    <div className="tg_root">
      {/* BACKDROP: gradiente + drift (bem “monitor premium”) */}
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

      {/* SCENES */}
      <div className="tg_stage">
        {/* Scene 0: Hero */}
        <div className={`tg_scene ${scene === 0 ? "isActive" : ""}`}>
          <div className="tg_sceneInner">
            <div className="tg_bigTitle">Bem-vindos</div>
            <div className="tg_bigSub">
              {SIGNAGE_CONFIG.locationLabel} • {weather ? "Clima ao vivo" : "Painel ao vivo"}
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

            {tvMode ? <div className="tg_hint">Dica: mantenha a TV em “Tela cheia”. O som pode precisar de 1 OK em “Ativar som”.</div> : null}
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
                <div className="tg_weatherTemp">
                  {Math.round(
                    Number(weather?.tempC ?? weather?.temp ?? weather?.temperature ?? NaN)
                  ) || "—"}
                  °C
                </div>
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
              {(headlines.length ? headlines : ["Sem manchetes por enquanto — conectando…"]).slice(0, 5).map((t, i) => (
                <div key={i} className="tg_newsItem">
                  <span className="tg_bullet" />
                  <span className="tg_newsText">{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Ticker bottom */}
      <div className="tg_bottom">
        <div className="tg_ticker">
          <div className="tg_tickerTrack">
            <span>{tickerText}</span>
            <span>{tickerText}</span>
          </div>
        </div>
      </div>

      {/* Music overlay */}
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

        /* BACKDROP: drift + vinheta */
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

        /* Bottom ticker */
        .tg_bottom {
          position: relative;
          z-index: 15;
          padding: 14px 28px 24px;
        }
        .tg_ticker {
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.40);
          overflow: hidden;
          backdrop-filter: blur(10px);
          box-shadow: 0 24px 90px rgba(0,0,0,0.50);
        }
        .tg_tickerTrack {
          display: inline-flex;
          gap: 56px;
          white-space: nowrap;
          padding: 12px 18px;
          animation: tg_marquee 26s linear infinite;
          font-size: 14px;
          opacity: 0.9;
        }
        @keyframes tg_marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }

        /* Responsive */
        @media (max-width: 980px) {
          .tg_time { font-size: 44px; }
          .tg_bigTitle { font-size: 46px; }
          .tg_stage { min-height: 62vh; }
          .tg_tabs { display: none; }
        }
      `}</style>
    </div>
  );
}
