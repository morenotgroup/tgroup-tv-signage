// src/components/MusicDock.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { SIGNAGE_CONFIG } from "@/config";

type Track = {
  src: string;
  title?: string;
  artist?: string;
};

export function MusicDock() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const tracks = useMemo<Track[]>(() => {
    const cfg: any = SIGNAGE_CONFIG as any;

    // aceita vários formatos de config sem quebrar
    const fromA = cfg?.musicTracks;
    const fromB = cfg?.music?.tracks;
    const fromC = cfg?.music?.playlist;

    const list = (fromA || fromB || fromC || []) as Track[];
    return Array.isArray(list) ? list.filter((t) => t?.src) : [];
  }, []);

  const enabled = useMemo(() => {
    const cfg: any = SIGNAGE_CONFIG as any;
    // default: ligado se tiver tracks
    return Boolean(cfg?.enableMusicDock ?? (tracks.length > 0));
  }, [tracks.length]);

  const [idx, setIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.7);

  const current = tracks[idx];

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.volume = volume;
  }, [volume]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      // auto próximo
      setIdx((i) => (tracks.length ? (i + 1) % tracks.length : 0));
    };

    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnded);

    return () => {
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnded);
    };
  }, [tracks.length]);

  useEffect(() => {
    // quando troca música, se estava tocando, continua tocando
    const a = audioRef.current;
    if (!a) return;
    if (!current?.src) return;

    a.src = current.src;

    if (isPlaying) {
      a.play().catch(() => {
        // TVs/Chrome podem bloquear autoplay sem gesto do usuário
        setIsPlaying(false);
      });
    }
  }, [current?.src]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!enabled || tracks.length === 0) return null;

  function toggle() {
    const a = audioRef.current;
    if (!a) return;

    if (a.paused) {
      a.play().catch(() => {
        setIsPlaying(false);
      });
    } else {
      a.pause();
    }
  }

  function prev() {
    setIdx((i) => (tracks.length ? (i - 1 + tracks.length) % tracks.length : 0));
  }

  function next() {
    setIdx((i) => (tracks.length ? (i + 1) % tracks.length : 0));
  }

  return (
    <>
      <audio ref={audioRef} preload="metadata" />

      <div className="mdock_root" role="region" aria-label="Music Dock">
        <div className="mdock_title">
          <div className="mdock_now">Música</div>
          <div className="mdock_track" title={current?.title || current?.src}>
            {current?.title || "Playlist"}
            {current?.artist ? <span className="mdock_artist"> • {current.artist}</span> : null}
          </div>
        </div>

        <div className="mdock_controls">
          <button type="button" className="mdock_btn" onClick={prev} aria-label="Anterior">
            ◀
          </button>

          <button type="button" className="mdock_btn mdock_btnMain" onClick={toggle} aria-label="Play/Pause">
            {isPlaying ? "⏸" : "▶"}
          </button>

          <button type="button" className="mdock_btn" onClick={next} aria-label="Próxima">
            ▶
          </button>

          <div className="mdock_vol">
            <span className="mdock_volIcon">🔊</span>
            <input
              className="mdock_slider"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label="Volume"
            />
          </div>
        </div>
      </div>

      <style jsx global>{`
        .mdock_root {
          position: fixed;
          right: 18px;
          bottom: 18px;
          z-index: 50;
          width: 340px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(0,0,0,0.45);
          backdrop-filter: blur(12px);
          box-shadow: 0 22px 90px rgba(0,0,0,0.6);
          padding: 12px 12px;
          color: #fff;
          overflow: hidden;
        }

        .mdock_title { margin-bottom: 10px; }
        .mdock_now {
          font-size: 11px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          opacity: 0.7;
          font-weight: 900;
        }
        .mdock_track {
          margin-top: 4px;
          font-size: 14px;
          font-weight: 900;
          opacity: 0.95;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .mdock_artist { opacity: 0.7; font-weight: 700; }

        .mdock_controls {
          display: grid;
          grid-template-columns: auto auto auto 1fr;
          gap: 10px;
          align-items: center;
        }

        .mdock_btn {
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.08);
          color: #fff;
          border-radius: 14px;
          padding: 10px 12px;
          font-weight: 900;
          cursor: pointer;
          line-height: 1;
        }

        .mdock_btnMain {
          background: rgba(255,255,255,0.92);
          color: #111;
          border: none;
        }

        .mdock_vol {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 10px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.06);
        }
        .mdock_volIcon { opacity: 0.8; }
        .mdock_slider { width: 100%; }
      `}</style>
    </>
  );
}

export default MusicDock;
