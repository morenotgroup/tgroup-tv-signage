"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AgencyBackdrop from "@/components/AgencyBackdrop";
import MusicDock from "@/components/MusicDock";
import { SIGNAGE_CONFIG } from "@/config";

/**
 * Helpers (PT-BR)
 */
function formatTimePtBR(d: Date) {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function formatDatePtBR(d: Date) {
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

type SceneId = 0 | 1 | 2 | 3;

export default function Page() {
  const [now, setNow] = useState(() => new Date());
  const [scene, setScene] = useState<SceneId>(0);

  // “sync” — atualiza quando a cena gira (ou quando você quiser amarrar em refresh de dados)
  const [lastSync, setLastSync] = useState<Date | null>(null);

  // TV mode (kiosk-friendly)
  const [tvMode, setTvMode] = useState(false);
  const [fullscreenHint, setFullscreenHint] = useState<string>("");

  const tickRef = useRef<number | null>(null);

  // --- Clock tick
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // --- Scene rotation
  useEffect(() => {
    // evita múltiplos intervals
    if (tickRef.current) window.clearInterval(tickRef.current);

    const ms = Math.max(6000, Number(SIGNAGE_CONFIG.sceneDurationMs || 12000));
    tickRef.current = window.setInterval(() => {
      setScene((s) => ((s + 1) % 4) as SceneId);
      setLastSync(new Date());
    }, ms);

    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, []);

  // --- Load TV mode preference (query param + localStorage)
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const q = url.searchParams.get("tv");
      const forced = q === "1" || q === "true";

      const saved = localStorage.getItem("tgroup_tv_mode");
      const savedOn = saved === "1";

      const initial = forced || savedOn;
      setTvMode(initial);
    } catch {
      // ignore
    }
  }, []);

  // --- Apply TV mode UX (hide cursor, reduce scroll, etc.)
  useEffect(() => {
    const cls = "tgroup-tvmode";
    if (tvMode) document.documentElement.classList.add(cls);
    else document.documentElement.classList.remove(cls);

    try {
      localStorage.setItem("tgroup_tv_mode", tvMode ? "1" : "0");
    } catch {
      // ignore
    }
  }, [tvMode]);

  // --- Fullscreen helper
  const onEnterFullscreen = useCallback(async () => {
    setFullscreenHint("");
    try {
      // Prefer a fullscreen no root para pegar tudo (backdrop + hud + dock)
      const el = document.documentElement as any;
      if (document.fullscreenElement) return;

      const req =
        el.requestFullscreen ||
        el.webkitRequestFullscreen ||
        el.mozRequestFullScreen ||
        el.msRequestFullscreen;

      if (typeof req === "function") {
        await req.call(el);
        setFullscreenHint("Fullscreen ativado ✅");
        window.setTimeout(() => setFullscreenHint(""), 2500);
      } else {
        setFullscreenHint("Esse navegador não suporta fullscreen automático.");
      }
    } catch {
      setFullscreenHint("Não consegui ativar fullscreen (permissão do navegador).");
    }
  }, []);

  // --- Hotkeys (TV friendly)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // evita conflito com inputs (se tiver)
      const t = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (t === "input" || t === "textarea" || (e.target as any)?.isContentEditable) return;

      if (e.key.toLowerCase() === "f") {
        void onEnterFullscreen();
      }
      if (e.key.toLowerCase() === "t") {
        setTvMode((v) => !v);
      }
      if (e.key.toLowerCase() === "arrowright") {
        setScene((s) => ((s + 1) % 4) as SceneId);
        setLastSync(new Date());
      }
      if (e.key.toLowerCase() === "arrowleft") {
        setScene((s) => ((s + 3) % 4) as SceneId);
        setLastSync(new Date());
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onEnterFullscreen]);

  // --- Ticker (“vibe agência”)
  const tickerText = useMemo(() => {
    const parts = [
      "Bem-vindos ✨",
      "TV Signage • T.Group",
      "Perdizes — São Paulo",
      "Atalhos: [F] fullscreen • [T] TV mode • ←/→ trocar telas",
    ];
    // rotaciona um pouco com o tempo
    const i = Math.floor((now.getTime() / 15000) % parts.length);
    return parts.slice(i).concat(parts.slice(0, i)).join("  •  ");
  }, [now]);

  return (
    <div className="relative min-h-screen w-full bg-black text-white overflow-hidden">
      {/* Backdrop “vibe agência” atrás de tudo */}
      <AgencyBackdrop />

      {/* Conteúdo real fica acima */}
      <div className="relative z-10">
        <div className="stage">
          {/* TOP ROW */}
          <div className={`topRow ${tvMode ? "tvDrift" : ""}`}>
            <div className={`brand ${tvMode ? "tvDriftAlt" : ""}`}>
              <div className="brandMark" />
              <div className="brandText">
                <div className="name">{SIGNAGE_CONFIG.companyName}</div>
                <div className="sub">TV Signage • {SIGNAGE_CONFIG.locationLabel}</div>
              </div>
            </div>

            <div className={`clock ${tvMode ? "tvDrift" : ""}`}>
              <div className="time">{formatTimePtBR(now)}</div>
              <div className="date">{formatDatePtBR(now)}</div>
            </div>
          </div>

          {/* TV HUD */}
          {tvMode ? (
            <div className="tvHud tvDriftAlt">
              <div className="tvStatusPill">
                TV • {formatTimePtBR(now)} • Sync {lastSync ? formatTimePtBR(lastSync) : "—"}
              </div>

              <div className="tvHudRight">
                <button className="tvAction" onClick={onEnterFullscreen} type="button">
                  Tela cheia
                </button>
                <button
                  className="tvAction ghost"
                  onClick={() => setTvMode(false)}
                  type="button"
                  title="Sair do TV mode"
                >
                  Sair
                </button>
              </div>

              {fullscreenHint ? <div className="tvHint">{fullscreenHint}</div> : null}
            </div>
          ) : null}

          {/* MAIN */}
          <div className="main">
            <div className="sceneWrap card">
              {/* Cena 0: Boas-vindas */}
              <div className={`scene ${scene === 0 ? "active" : ""}`}>
                <h1 className="h1">Bem-vindos 👋</h1>
                <p className="p">
                  Uma experiência viva pra recepção: clima, aniversariantes do mês, manchetes e recados — com cara de
                  agência premium.
                </p>

                <div className="kpis">
                  <div className="kpi">
                    <div className="label">Agora</div>
                    <div className="value">{formatTimePtBR(now)}</div>
                  </div>
                  <div className="kpi">
                    <div className="label">Local</div>
                    <div className="value">SP</div>
                  </div>
                  <div className="kpi">
                    <div className="label">Status</div>
                    <div className="value">ON</div>
                  </div>
                </div>

                <div className="hint">
                  Dica: abra com <b>?tv=1</b> e aperta <b>F</b> pra fullscreen. Em TV/kiosk, autoplay de áudio pode
                  pedir 1 clique no “Tocar”.
                </div>
              </div>

              {/* Cena 1: Placeholder (você mantém suas cenas atuais no PR2/PR1) */}
              <div className={`scene ${scene === 1 ? "active" : ""}`}>
                <h2 className="h2">Clima ☁️</h2>
                <p className="p">
                  Se você já tem Weather/News/Birthdays implementados, pode manter como está — o TV Mode aqui não quebra
                  nada, ele só adiciona HUD + drift + fullscreen + ticker.
                </p>
              </div>

              {/* Cena 2 */}
              <div className={`scene ${scene === 2 ? "active" : ""}`}>
                <h2 className="h2">Aniversariantes 🎂</h2>
                <p className="p">
                  Regra que você pediu: se não tiver aniversariante no dia, a tela mostra os aniversariantes do mês.
                </p>
              </div>

              {/* Cena 3 */}
              <div className={`scene ${scene === 3 ? "active" : ""}`}>
                <h2 className="h2">Manchetes 🗞️</h2>
                <p className="p">
                  RSS Google News BR (já está no config). Se quiser, depois eu deixo essa tela mais “Bloomberg de
                  agência”, com cards, categorias e um “breaking bar”.
                </p>
              </div>
            </div>
          </div>

          {/* FOOTER */}
          <div className={`footer ${tvMode ? "tvDrift" : ""}`}>
            <div className="ticker">
              <span>{tickerText}</span>
            </div>
            <div className="pill">{lastSync ? `Sync: ${formatTimePtBR(lastSync)}` : "Sync: —"}</div>
          </div>
        </div>

        {/* Dock de música (fixo na tela) */}
        <MusicDock />
      </div>

      {/* CSS extra pra TV mode + HUD + drift (sem depender do resto do projeto) */}
      <style jsx global>{`
        .tgroup-tvmode,
        .tgroup-tvmode body {
          cursor: none;
          overscroll-behavior: none;
        }

        .tvHud {
          position: absolute;
          top: 18px;
          right: 18px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          align-items: flex-end;
          z-index: 30;
          pointer-events: auto;
        }

        .tvHudRight {
          display: flex;
          gap: 10px;
          align-items: center;
          justify-content: flex-end;
        }

        .tvStatusPill {
          font-size: 12px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          padding: 10px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(0, 0, 0, 0.35);
          backdrop-filter: blur(10px);
        }

        .tvAction {
          height: 40px;
          padding: 0 14px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.12);
          color: white;
          font-weight: 700;
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .tvAction:hover {
          background: rgba(255, 255, 255, 0.18);
        }

        .tvAction.ghost {
          background: rgba(0, 0, 0, 0.25);
        }

        .tvHint {
          font-size: 12px;
          opacity: 0.8;
          max-width: 320px;
          text-align: right;
        }

        /* drift suave pra dar “vida” na TV */
        .tvDrift {
          animation: tgroupDrift 22s ease-in-out infinite;
        }
        .tvDriftAlt {
          animation: tgroupDriftAlt 26s ease-in-out infinite;
        }

        @keyframes tgroupDrift {
          0% {
            transform: translate3d(0, 0, 0);
          }
          50% {
            transform: translate3d(8px, -6px, 0);
          }
          100% {
            transform: translate3d(0, 0, 0);
          }
        }

        @keyframes tgroupDriftAlt {
          0% {
            transform: translate3d(0, 0, 0);
          }
          50% {
            transform: translate3d(-10px, 7px, 0);
          }
          100% {
            transform: translate3d(0, 0, 0);
          }
        }
      `}</style>
    </div>
  );
}
