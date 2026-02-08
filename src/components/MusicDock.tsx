"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { SIGNAGE_CONFIG } from "@/config";

type RadioProfileId = "agency" | "focus" | "chill";

type ApiResp = {
  ok: boolean;
  profile: RadioProfileId;
  label?: string;
  stations: Station[];
};

type Station = {
  id: string;
  name: string;
  streamUrl: string;
  favicon?: string;
  country?: string;
  codec?: string;
  bitrate?: number;
};

const LS_KEYS = {
  audioUnlocked: "tgroup_tv_audio_unlocked",
  profile: "tgroup_tv_profile",
  volume: "tgroup_tv_volume",
  lastStationId: "tgroup_tv_last_station_id",
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
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

  const [profile, setProfile] = useState<RadioProfileId>(SIGNAGE_CONFIG.audio.defaultProfile);
  const [stations, setStations] = useState<Station[]>([]);
  const [idx, setIdx] = useState(0);

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState(false);

  const [unlocked, setUnlocked] = useState(false);

  const current = useMemo(() => stations[Math.max(0, Math.min(idx, stations.length - 1))], [stations, idx]);

  // load local prefs once
  useEffect(() => {
    try {
      const savedProfile = localStorage.getItem(LS_KEYS.profile) as RadioProfileId | null;
      if (savedProfile === "agency" || savedProfile === "focus" || savedProfile === "chill") {
        setProfile(savedProfile);
      }
      const vRaw = localStorage.getItem(LS_KEYS.volume);
      const v = vRaw ? Number(vRaw) : NaN;

      const a = audioRef.current;
      if (a) {
        a.volume = Number.isFinite(v) ? clamp(v, 0, 1) : SIGNAGE_CONFIG.audio.defaultVolume;
      }

      const unlockedFlag = localStorage.getItem(LS_KEYS.audioUnlocked);
      setUnlocked(unlockedFlag === "1");
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function persistProfile(p: RadioProfileId) {
    try {
      localStorage.setItem(LS_KEYS.profile, p);
    } catch {}
  }
  function persistVolume(v: number) {
    try {
      localStorage.setItem(LS_KEYS.volume, String(v));
    } catch {}
  }
  function persistLastStationId(id: string) {
    try {
      localStorage.setItem(LS_KEYS.lastStationId, id);
    } catch {}
  }

  async function loadStations(p: RadioProfileId) {
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch(`/api/radio?profile=${encodeURIComponent(p)}&limit=${SIGNAGE_CONFIG.audio.stationsLimit}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as ApiResp;

      const list = (data?.stations || []).filter((s) => !!s?.streamUrl);
      const shuffled = shuffle(list);

      let initialIdx = 0;
      try {
        const lastId = localStorage.getItem(LS_KEYS.lastStationId);
        if (lastId) {
          const found = shuffled.findIndex((s) => s.id === lastId);
          if (found >= 0) initialIdx = found;
        }
      } catch {}

      setStations(shuffled);
      setIdx(initialIdx);
    } catch {
      setStations([]);
      setIdx(0);
      setMsg("Rádio indisponível agora.");
    } finally {
      setLoading(false);
    }
  }

  // reload when profile changes
  useEffect(() => {
    persistProfile(profile);
    loadStations(profile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // autoplay policy strategy:
  // 1) tenta tocar MUDO automaticamente (quase sempre passa)
  // 2) se a TV bloquear até mudo, mostra botão "Tocar"
  async function tryAutoPlayMuted() {
    const a = audioRef.current;
    if (!a || !current?.streamUrl) return;

    a.crossOrigin = "anonymous";
    a.src = current.streamUrl;

    // autoplay-muted: é o que mais funciona em TV browser nativo
    a.muted = SIGNAGE_CONFIG.audio.autoplayMuted ? true : !unlocked;

    // se já foi “destravado” antes, tenta com som
    if (unlocked) a.muted = false;

    try {
      await a.play();
      setIsPlaying(true);
      setMsg(unlocked ? "" : "Som desativado (TV). Toque em “Ativar som” uma vez.");
      persistLastStationId(current.id);
    } catch {
      setIsPlaying(false);
      setMsg("Toque em “Tocar” (TV bloqueia autoplay).");
    }
  }

  useEffect(() => {
    if (!current?.streamUrl) return;
    tryAutoPlayMuted();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.streamUrl]);

  async function play() {
    const a = audioRef.current;
    if (!a || !current?.streamUrl) return;

    a.crossOrigin = "anonymous";
    a.src = current.streamUrl;

    // se já desbloqueou, vai com som; senão, tenta mudo
    a.muted = unlocked ? false : true;

    try {
      await a.play();
      setIsPlaying(true);
      setMsg(unlocked ? "" : "Som desativado. Clique em “Ativar som”.");
      persistLastStationId(current.id);
    } catch {
      setIsPlaying(false);
      setMsg("Não deu play. Tente novamente.");
    }
  }

  function pause() {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    setIsPlaying(false);
  }

  async function unlockAudio() {
    const a = audioRef.current;
    if (!a) return;

    // precisa ser gesto do usuário
    try {
      localStorage.setItem(LS_KEYS.audioUnlocked, "1");
    } catch {}

    setUnlocked(true);

    // tenta imediatamente com som
    a.muted = false;
    try {
      await a.play();
      setIsPlaying(true);
      setMsg("");
    } catch {
      setMsg("Clique em “Tocar” para iniciar (TV).");
    }
  }

  function next() {
    if (!stations.length) return;
    setIdx((v) => (v + 1) % stations.length);
  }

  function prev() {
    if (!stations.length) return;
    setIdx((v) => (v - 1 + stations.length) % stations.length);
  }

  // auto next on error/ended
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const onError = () => {
      next();
    };
    const onEnded = () => {
      next();
    };

    a.addEventListener("error", onError);
    a.addEventListener("ended", onEnded);

    return () => {
      a.removeEventListener("error", onError);
      a.removeEventListener("ended", onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stations]);

  const safeIdx = clamp(idx, 0, Math.max(0, stations.length - 1));
  const vol = audioRef.current?.volume ?? SIGNAGE_CONFIG.audio.defaultVolume;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[560px] max-w-[92vw]">
      <audio ref={audioRef} preload="none" />

      <div className="rounded-3xl border border-white/10 bg-black/55 backdrop-blur-xl shadow-2xl overflow-hidden">
        <div className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-white/10 flex items-center justify-center overflow-hidden">
            {current?.favicon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={current.favicon} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="text-xs opacity-70">♫</div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-widest opacity-60">
              Rádio • {profile === "agency" ? "Agência" : profile === "focus" ? "Focus" : "Chill"}
            </div>
            <div className="truncate text-sm font-semibold">
              {loading ? "Carregando..." : current?.name || "Sem estação"}
            </div>
            <div className="text-xs opacity-60 truncate">
              {stations.length ? `${safeIdx + 1}/${stations.length}` : ""}
              {current?.codec ? ` • ${current.codec}` : ""}
              {typeof current?.bitrate === "number" ? ` • ${current.bitrate}kbps` : ""}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={profile}
              onChange={(e) => setProfile(e.target.value as RadioProfileId)}
              className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs outline-none"
              title="Preset"
            >
              <option value="agency">Agência</option>
              <option value="focus">Focus</option>
              <option value="chill">Chill</option>
            </select>

            <button
              onClick={() => {
                if (isPlaying) pause();
                else play();
              }}
              className="rounded-2xl px-4 py-2 bg-white text-black text-sm font-semibold hover:opacity-90 transition"
            >
              {isPlaying ? "Pausar" : "Tocar"}
            </button>

            {!unlocked ? (
              <button
                onClick={unlockAudio}
                className="rounded-2xl px-3 py-2 bg-white/10 border border-white/10 text-sm hover:bg-white/15 transition"
                title="Ativar som"
              >
                Ativar som
              </button>
            ) : null}

            <button
              onClick={prev}
              className="rounded-2xl px-3 py-2 bg-white/10 border border-white/10 text-sm hover:bg-white/15 transition"
              title="Anterior"
            >
              ◀︎
            </button>

            <button
              onClick={next}
              className="rounded-2xl px-3 py-2 bg-white/10 border border-white/10 text-sm hover:bg-white/15 transition"
              title="Próxima"
            >
              ▶︎
            </button>
          </div>
        </div>

        <div className="px-4 pb-4 flex items-center gap-3">
          <div className="text-xs opacity-70 min-w-[84px]">Volume</div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(vol * 100)}
            onChange={(e) => {
              const a = audioRef.current;
              if (!a) return;
              const v = clamp(Number(e.target.value) / 100, 0, 1);
              a.volume = v;
              persistVolume(v);
            }}
            className="w-full"
          />
          <div className="text-xs opacity-70 w-10 text-right">{Math.round(vol * 100)}%</div>
        </div>

        {msg ? (
          <div className="px-4 pb-4 text-xs opacity-70">
            {msg}
          </div>
        ) : null}
      </div>
    </div>
  );
}
