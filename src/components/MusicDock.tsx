// src/components/MusicDock.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { SIGNAGE_CONFIG } from "@/config";

type Station = {
  id: string;
  name: string;
  url: string;
};

export type RadioProfileId = "agency" | "focus" | "chill";

const DEFAULT_STATIONS: Record<RadioProfileId, Station[]> = {
  agency: [
    { id: "lofi", name: "Lo-fi Focus", url: "https://streams.ilovemusic.de/iloveradio17.mp3" },
    { id: "hits", name: "Pop Hits", url: "https://streams.ilovemusic.de/iloveradio1.mp3" },
  ],
  focus: [
    { id: "focus", name: "Focus", url: "https://streams.ilovemusic.de/iloveradio14.mp3" },
    { id: "chill", name: "Chill", url: "https://streams.ilovemusic.de/iloveradio13.mp3" },
  ],
  chill: [
    { id: "chill", name: "Chill", url: "https://streams.ilovemusic.de/iloveradio13.mp3" },
    { id: "lounge", name: "Lounge", url: "https://streams.ilovemusic.de/iloveradio12.mp3" },
  ],
};

function safeProfile(v: unknown): RadioProfileId {
  if (v === "agency" || v === "focus" || v === "chill") return v;
  return "agency";
}

// ✅ Agora é EXPORT NOMEADO
export function MusicDock() {
  // 👇 IMPORTANTÍSSIMO: não referenciar SIGNAGE_CONFIG.audio tipado direto
  // porque seu config.ts pode não ter a chave "audio".
  // Aqui a gente lê via any e mantém o build estável.
  const cfg = SIGNAGE_CONFIG as any;

  const audioCfg = (cfg?.audio ?? null) as
    | {
        enabled?: boolean;
        defaultProfile?: string;
        volume?: number; // 0..1
        stations?: Partial<Record<RadioProfileId, Station[]>>;
      }
    | null;

  const tvMode = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get("tv") === "1";
    } catch {
      return false;
    }
  }, []);

  const enabled = !!audioCfg?.enabled; // se não tiver audio no config, fica false
  const initialProfile = safeProfile(audioCfg?.defaultProfile);

  const [uiOpen, setUiOpen] = useState(false);
  const [profile, setProfile] = useState<RadioProfileId>(() => initialProfile);
  const [idx, setIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stations = useMemo(() => {
    const override = audioCfg?.stations?.[profile];
    return (override && override.length ? override : DEFAULT_STATIONS[profile]) ?? [];
  }, [audioCfg, profile]);

  const current = stations[idx % Math.max(1, stations.length)];

  // init audio element once
  useEffect(() => {
    if (!enabled) return;
    if (audioRef.current) return;

    const a = new Audio();
    a.preload = "none";
    a.crossOrigin = "anonymous";
    a.volume = typeof audioCfg?.volume === "number" ? Math.max(0, Math.min(1, audioCfg.volume)) : 0.35;

    a.addEventListener("playing", () => setIsPlaying(true));
    a.addEventListener("pause", () => setIsPlaying(false));
    a.addEventListener("ended", () => setIsPlaying(false));
    a.addEventListener("error", () => {
      // se uma stream falhar, tenta a próxima
      setIdx((n) => n + 1);
    });

    audioRef.current = a;

    return () => {
      try {
        a.pause();
        a.src = "";
      } catch {}
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // update src when station changes
  useEffect(() => {
    if (!enabled) return;
    const a = audioRef.current;
    if (!a) return;
    if (!current?.url) return;

    try {
      a.src = current.url;
      // se já estava tocando, tenta continuar
      if (isPlaying) {
        const p = a.play();
        if (p && typeof (p as Promise<void>).catch === "function") {
          (p as Promise<void>).catch(() => setNeedsGesture(true));
        }
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, current?.url]);

  // hide UI by default on TV, show only when clicked
  useEffect(() => {
    if (!enabled) return;
    if (!tvMode) setUiOpen(true);
  }, [enabled, tvMode]);

  if (!enabled) return null;

  async function togglePlay() {
    const a = audioRef.current;
    if (!a) return;

    try {
      if (a.paused) {
        const p = a.play();
        if (p && typeof (p as Promise<void>).catch === "function") {
          await (p as Promise<void>);
        }
        setNeedsGesture(false);
      } else {
        a.pause();
      }
    } catch {
      setNeedsGesture(true);
    }
  }

  function next() {
    setIdx((n) => (n + 1) % Math.max(1, stations.length));
  }

  function prev() {
    setIdx((n) => (n - 1 + Math.max(1, stations.length)) % Math.max(1, stations.length));
  }

  return (
    <>
      <div className="tg_musicDock">
        <button className="tg_musicFab" onClick={() => setUiOpen((v) => !v)} type="button">
          ♪
        </button>

        {uiOpen ? (
          <div className="tg_musicPanel">
            <div className="tg_musicTop">
              <div className="tg_musicTitle">Som ambiente</div>
              <div className="tg_musicSub">{current?.name || "—"}</div>
            </div>

            {needsGesture ? (
              <div className="tg_musicWarn">
                Toque em <b>Play</b> pra liberar o áudio (TVs/Chrome exigem 1 interação).
              </div>
            ) : null}

            <div className="tg_musicControls">
              <button className="tg_musicBtn" onClick={prev} type="button" aria-label="Anterior">
                ◀
              </button>
              <button className="tg_musicBtn tg_musicPlay" onClick={togglePlay} type="button">
                {isPlaying ? "Pause" : "Play"}
              </button>
              <button className="tg_musicBtn" onClick={next} type="button" aria-label="Próxima">
                ▶
              </button>
            </div>

            <div className="tg_musicProfiles">
              {(["agency", "focus", "chill"] as RadioProfileId[]).map((p) => (
                <button
                  key={p}
                  className={`tg_chip ${profile === p ? "isActive" : ""}`}
                  onClick={() => {
                    setProfile(p);
                    setIdx(0);
                  }}
                  type="button"
                >
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <style jsx global>{`
        .tg_musicDock {
          position: fixed;
          right: 16px;
          bottom: 86px;
          z-index: 9999;
          display: flex;
          align-items: flex-end;
          gap: 12px;
          pointer-events: auto;
        }

        .tg_musicFab {
          width: 44px;
          height: 44px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(0, 0, 0, 0.55);
          color: #fff;
          font-weight: 900;
          cursor: pointer;
          backdrop-filter: blur(10px);
          box-shadow: 0 18px 60px rgba(0, 0, 0, 0.55);
        }

        .tg_musicPanel {
          width: 320px;
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(0, 0, 0, 0.55);
          color: #fff;
          padding: 14px;
          backdrop-filter: blur(12px);
          box-shadow: 0 24px 90px rgba(0, 0, 0, 0.6);
          overflow: hidden;
        }

        .tg_musicTop {
          display: grid;
          gap: 6px;
          margin-bottom: 10px;
        }

        .tg_musicTitle {
          font-weight: 950;
          letter-spacing: -0.02em;
          font-size: 14px;
        }

        .tg_musicSub {
          opacity: 0.8;
          font-size: 12px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tg_musicWarn {
          margin: 10px 0;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.06);
          font-size: 12px;
          opacity: 0.95;
        }

        .tg_musicControls {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 10px;
          align-items: center;
          margin-top: 10px;
        }

        .tg_musicBtn {
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.07);
          color: #fff;
          cursor: pointer;
          font-weight: 900;
        }

        .tg_musicPlay {
          background: rgba(255, 255, 255, 0.92);
          color: #111;
          border: none;
        }

        .tg_musicProfiles {
          display: flex;
          gap: 8px;
          margin-top: 12px;
          justify-content: space-between;
        }

        .tg_chip {
          flex: 1;
          padding: 10px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.06);
          color: #fff;
          cursor: pointer;
          font-size: 11px;
          letter-spacing: 0.18em;
          font-weight: 900;
          opacity: 0.85;
        }

        .tg_chip.isActive {
          background: rgba(255, 255, 255, 0.9);
          color: #111;
          opacity: 1;
          border: none;
        }

        @media (max-width: 980px) {
          .tg_musicPanel {
            width: 280px;
          }
        }
      `}</style>
    </>
  );
}

// ✅ Agora também tem EXPORT DEFAULT
export default MusicDock;
