"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { SIGNAGE_CONFIG } from "../config";

type RadioProfileId = "agency" | "focus" | "chill";

type Station = {
  id?: string;
  stationuuid?: string;
  name?: string;
  streamUrl?: string;
  url_resolved?: string;
  favicon?: string;
  codec?: string;
  bitrate?: number;
  country?: string;
};

type ApiResp =
  | { ok: true; stations: Station[] }
  | { ok: false; stations?: Station[]; error?: string };

const LS_KEYS = {
  unlocked: "tgroup_tv_audio_unlocked",
  profile: "tgroup_tv_profile",
  lastStation: "tgroup_tv_last_station_id",
  volume: "tgroup_tv_volume",
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function pickStream(s: Station) {
  return (s.streamUrl || s.url_resolved || "").trim();
}

function pickId(s: Station) {
  return (s.id || s.stationuuid || "").trim();
}

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function MusicDock() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const switchingRef = useRef(false);
  const failRef = useRef(0);

  const [enabled] = useState(!!SIGNAGE_CONFIG.audio?.enabled);
  const [profile, setProfile] = useState<RadioProfileId>(() => {   const v = SIGNAGE_CONFIG.audio?.defaultProfile;   // se vier string, a gente assume que é um id válido do seu union (RadioProfileId)   // se vier undefined/qualquer coisa, cai no "agency"   return (typeof v === "string" ? (v as RadioProfileId) : "agency"); });
  const [stations, setStations] = useState<Station[]>([]);
  const [idx, setIdx] = useState(0);

  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const tvMode = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get("tv") === "1";
    } catch {
      return false;
    }
  }, []);

  const current = stations.length ? stations[clamp(idx, 0, stations.length - 1)] : null;

  function persistProfile(p: RadioProfileId) {
    try {
      localStorage.setItem(LS_KEYS.profile, p);
    } catch {}
  }
  function persistUnlocked(v: boolean) {
    try {
      localStorage.setItem(LS_KEYS.unlocked, v ? "1" : "0");
    } catch {}
  }
  function persistLastStation(id: string) {
    try {
      localStorage.setItem(LS_KEYS.lastStation, id);
    } catch {}
  }
  function persistVolume(v: number) {
    try {
      localStorage.setItem(LS_KEYS.volume, String(v));
    } catch {}
  }

  async function loadStations(p: RadioProfileId) {
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch(`/api/radio?profile=${encodeURIComponent(p)}&limit=80`, { cache: "no-store" });
      const data = (await res.json()) as ApiResp;

      const list = (data as any)?.stations || [];
      const cleaned: Station[] = (list as unknown[])
        .map((s) => s as Station)
        .filter(
          (s: Station) => Boolean(pickStream(s)) && Boolean((s.name ?? "").trim())
        );

      const sh = shuffle(cleaned);

      // tenta manter última estação
      let initialIdx = 0;
      try {
        const lastId = localStorage.getItem(LS_KEYS.lastStation);
        if (lastId) {
          const found = sh.findIndex((s) => pickId(s) === lastId);
          if (found >= 0) initialIdx = found;
        }
      } catch {}

      setStations(sh);
      setIdx(initialIdx);
    } catch (e: any) {
      setStations([]);
      setMsg("Falha ao carregar rádios.");
    } finally {
      setLoading(false);
    }
  }

  function nextStation() {
    if (!stations.length) return;
    setIdx((v) => (v + 1) % stations.length);
  }

  function prevStation() {
    if (!stations.length) return;
    setIdx((v) => (v - 1 + stations.length) % stations.length);
  }

  async function tryPlay() {
    const a = audioRef.current;
    if (!a || !current) return;

    const stream = pickStream(current);
    if (!stream) return;

    // evita loop
    if (switchingRef.current) return;

    a.crossOrigin = "anonymous";
    a.src = stream;

    // volume padrão
    const defaultVol = SIGNAGE_CONFIG.audio?.volume ?? 0.35;
    a.volume = clamp(a.volume || defaultVol, 0, 1);

    // estratégia:
    // 1) tenta tocar com som (muted=false)
    // 2) se bloquear, toca mutado + pede OK pra destravar
    try {
      a.muted = false;
      await a.play();
      setIsPlaying(true);
      setUnlocked(true);
      persistUnlocked(true);
      const id = pickId(current);
      if (id) persistLastStation(id);
      failRef.current = 0;
      setMsg("");
      return;
    } catch {
      // fallback mutado
      try {
        a.muted = true;
        await a.play();
        setIsPlaying(true);
        setUnlocked(false);
        persistUnlocked(false);
        setMsg("Som bloqueado pela TV. Aperte OK em “Ativar som”.");
      } catch {
        setIsPlaying(false);
        setMsg("Não consegui iniciar áudio. Tente “Ativar som”.");
      }
    }
  }

  async function unlockAndUnmute() {
    const a = audioRef.current;
    if (!a) return;

    try {
      a.muted = false;
      await a.play();
      setUnlocked(true);
      persistUnlocked(true);
      setIsPlaying(true);
      setMsg("");
    } catch {
      setUnlocked(false);
      persistUnlocked(false);
      setMsg("A TV ainda bloqueou. Tente OK novamente.");
    }
  }

  function pause() {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    setIsPlaying(false);
  }

  // boot: prefs
  useEffect(() => {
    try {
      const savedProfile = localStorage.getItem(LS_KEYS.profile) as RadioProfileId | null;
      if (savedProfile === "agency" || savedProfile === "focus" || savedProfile === "chill") {
        setProfile(savedProfile);
      }
      const savedUnlocked = localStorage.getItem(LS_KEYS.unlocked);
      setUnlocked(savedUnlocked === "1");

      const savedVol = localStorage.getItem(LS_KEYS.volume);
      const v = savedVol ? Number(savedVol) : NaN;
      const a = audioRef.current;
      if (a && Number.isFinite(v)) a.volume = clamp(v, 0, 1);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // profile changes -> reload list
  useEffect(() => {
    if (!enabled) return;
    persistProfile(profile);
    loadStations(profile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, enabled]);

  // when stations/idx changes -> try play
  useEffect(() => {
    if (!enabled) return;
    if (!current) return;
    void tryPlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, idx, stations.length]);

  // auto switch on error/ended
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const onError = () => {
      if (!enabled) return;
      failRef.current += 1;
      if (failRef.current >= 3) {
        failRef.current = 0;
        setMsg("Stream falhou. Trocando estação…");
      }
      nextStation();
    };

    const onEnded = () => {
      if (!enabled) return;
      nextStation();
    };

    a.addEventListener("error", onError);
    a.addEventListener("ended", onEnded);

    return () => {
      a.removeEventListener("error", onError);
      a.removeEventListener("ended", onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, stations.length]);

  if (!enabled) return null;

  const volume = audioRef.current?.volume ?? (SIGNAGE_CONFIG.audio?.volume ?? 0.35);

  return (
    <div style={{ position: "fixed", right: 16, bottom: 16, zIndex: 9999, width: tvMode ? 520 : 560, maxWidth: "92vw" }}>
      <audio ref={audioRef} preload="none" playsInline />

      <div
        style={{
          borderRadius: 22,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(14px)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
          overflow: "hidden",
          color: "white",
        }}
      >
        <div style={{ padding: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              height: 42,
              width: 42,
              borderRadius: 14,
              background: "rgba(255,255,255,0.08)",
              overflow: "hidden",
              display: "grid",
              placeItems: "center",
              flex: "0 0 auto",
            }}
          >
            {current?.favicon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={current.favicon} alt="" style={{ height: "100%", width: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ opacity: 0.7, fontSize: 14 }}>♫</span>
            )}
          </div>

          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
            <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", opacity: 0.65 }}>
              Rádio • {profile === "agency" ? "Agência" : profile === "focus" ? "Focus" : "Chill"}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {loading ? "Carregando estações…" : current?.name || "Sem estação"}
            </div>
            <div style={{ fontSize: 11, opacity: 0.6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {msg ? msg : unlocked ? "Som liberado" : isPlaying ? "Tocando (mutado)" : "Parado"}
            </div>
          </div>

          <select
            value={profile}
            onChange={(e) => setProfile(e.target.value as RadioProfileId)}
            style={{
              borderRadius: 12,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "white",
              padding: "10px 10px",
              fontSize: 12,
              outline: "none",
            }}
            title="Preset"
          >
            <option value="agency">Agência</option>
            <option value="focus">Focus</option>
            <option value="chill">Chill</option>
          </select>

          <button
            onClick={() => {
              if (unlocked) {
                if (isPlaying) pause();
                else void tryPlay();
              } else {
                void unlockAndUnmute();
              }
            }}
            style={{
              borderRadius: 16,
              padding: "10px 14px",
              background: unlocked ? "white" : "rgba(255,255,255,0.18)",
              border: unlocked ? "none" : "1px solid rgba(255,255,255,0.18)",
              color: unlocked ? "black" : "white",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {unlocked ? (isPlaying ? "Pausar" : "Tocar") : "Ativar som"}
          </button>

          <button
            onClick={prevStation}
            style={{
              borderRadius: 14,
              padding: "10px 12px",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "white",
              cursor: "pointer",
            }}
            title="Anterior"
          >
            ◀︎
          </button>

          <button
            onClick={nextStation}
            style={{
              borderRadius: 14,
              padding: "10px 12px",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "white",
              cursor: "pointer",
            }}
            title="Próxima"
          >
            ▶︎
          </button>
        </div>

        <div style={{ padding: "0 14px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 11, opacity: 0.7, width: 70 }}>Volume</div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={(e) => {
              const a = audioRef.current;
              if (!a) return;
              const v = clamp(Number(e.target.value) / 100, 0, 1);
              a.volume = v;
              persistVolume(v);
            }}
            style={{ width: "100%" }}
          />
          <div style={{ fontSize: 11, opacity: 0.7, width: 46, textAlign: "right" }}>
            {Math.round(volume * 100)}%
          </div>
        </div>
      </div>
    </div>
  );
}

export default MusicDock;
