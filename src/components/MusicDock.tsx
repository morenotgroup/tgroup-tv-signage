"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type RadioProfileId = "agency" | "focus" | "chill";

type Station = {
  id: string;
  name: string;
  streamUrl: string;
  favicon?: string;
  country?: string;
  codec?: string;
  bitrate?: number;
};

type ApiResp = {
  profile: RadioProfileId;
  label?: string;
  count?: number;
  stations: Station[];
};

const LS_KEYS = {
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

export default function MusicDock() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const failRef = useRef<number>(0);
  const switchingRef = useRef<boolean>(false);

  const [profile, setProfile] = useState<RadioProfileId>("agency");
  const [stations, setStations] = useState<Station[]>([]);
  const [idx, setIdx] = useState(0);

  const [loading, setLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const current = useMemo(() => stations[idx], [stations, idx]);

  // Carrega preferências locais
  useEffect(() => {
    try {
      const savedProfile = localStorage.getItem(LS_KEYS.profile) as RadioProfileId | null;
      if (savedProfile === "agency" || savedProfile === "focus" || savedProfile === "chill") {
        setProfile(savedProfile);
      }
      const savedVolume = localStorage.getItem(LS_KEYS.volume);
      const v = savedVolume ? Number(savedVolume) : NaN;
      if (!Number.isNaN(v)) {
        const a = audioRef.current;
        if (a) a.volume = clamp(v, 0, 1);
      }
    } catch {
      // ignore
    }
  }, []);

  // Aplica volume padrão ao montar
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    // volume “ambiente”
    if (Number.isNaN(a.volume) || a.volume === 1) a.volume = 0.35;
  }, []);

  async function loadStations(p: RadioProfileId) {
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch(`/api/radio?profile=${encodeURIComponent(p)}&limit=80`, {
        cache: "no-store",
      });
      const data = (await res.json()) as ApiResp;

      const list = (data?.stations || []).filter((s) => !!s?.streamUrl);
      const shuffled = shuffle(list);

      // tenta manter a última estação
      let initialIdx = 0;
      try {
        const lastId = localStorage.getItem(LS_KEYS.lastStationId);
        if (lastId) {
          const found = shuffled.findIndex((s) => s.id === lastId);
          if (found >= 0) initialIdx = found;
        }
      } catch {
        // ignore
      }

      setStations(shuffled);
      setIdx(initialIdx);
    } catch {
      setStations([]);
      setIdx(0);
      setMsg("Não consegui carregar a lista de rádios agora.");
    } finally {
      setLoading(false);
    }
  }

  function persistProfile(p: RadioProfileId) {
    try {
      localStorage.setItem(LS_KEYS.profile, p);
    } catch {
      // ignore
    }
  }

  function persistVolume(v: number) {
    try {
      localStorage.setItem(LS_KEYS.volume, String(v));
    } catch {
      // ignore
    }
  }

  function persistLastStationId(id?: string) {
    if (!id) return;
    try {
      localStorage.setItem(LS_KEYS.lastStationId, id);
    } catch {
      // ignore
    }
  }

  async function playCurrent() {
    const a = audioRef.current;
    if (!a || !current?.streamUrl) return;

    setMsg("");
    setIsReady(true);

    // evita loop de troca
    if (switchingRef.current) return;

    a.crossOrigin = "anonymous";
    a.src = current.streamUrl;

    try {
      await a.play();
      setIsPlaying(true);
      persistLastStationId(current.id);
      failRef.current = 0;
    } catch {
      // Autoplay pode ser bloqueado: pede 1 clique
      setIsPlaying(false);
      setMsg("Clique em TOCAR para liberar o áudio (modo TV/kiosk costuma bloquear autoplay).");
    }
  }

  function pause() {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    setIsPlaying(false);
  }

  function nextStation() {
    setIdx((prev) => {
      if (stations.length <= 1) return 0;
      return (prev + 1) % stations.length;
    });
  }

  function prevStation() {
    setIdx((prev) => {
      if (stations.length <= 1) return 0;
      return (prev - 1 + stations.length) % stations.length;
    });
  }

  async function safeSwitchAndPlay() {
    // quando dá erro no stream, troca de estação e tenta tocar
    if (switchingRef.current) return;
    switchingRef.current = true;

    try {
      failRef.current += 1;

      // se cair várias vezes seguidas, recarrega a lista
      if (failRef.current >= 4) {
        failRef.current = 0;
        await loadStations(profile);
      } else {
        nextStation();
      }
    } finally {
      // dá um respiro pro browser trocar a fonte
      setTimeout(() => {
        switchingRef.current = false;
      }, 500);
    }
  }

  // Recarrega stations ao trocar profile
  useEffect(() => {
    persistProfile(profile);
    loadStations(profile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // Quando muda de estação: se estava tocando, tenta tocar a nova
  useEffect(() => {
    if (!current?.streamUrl) return;

    if (isPlaying) {
      playCurrent();
    } else {
      const a = audioRef.current;
      if (a) {
        a.crossOrigin = "anonymous";
        a.src = current.streamUrl;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, stations]);

  // Listeners de erro / ended
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const onError = () => {
      // se estiver tocando ou tentando tocar, troca automático
      if (isPlaying || isReady) safeSwitchAndPlay();
    };

    const onEnded = () => {
      if (isPlaying || isReady) nextStation();
    };

    a.addEventListener("error", onError);
    a.addEventListener("ended", onEnded);

    return () => {
      a.removeEventListener("error", onError);
      a.removeEventListener("ended", onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, isReady, profile, stations]);

  const safeIdx = clamp(idx, 0, Math.max(0, stations.length - 1));
  const volume = audioRef.current?.volume ?? 0.35;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[560px] max-w-[92vw]">
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
              {loading ? "Carregando estações..." : current?.name || "Sem estação"}
            </div>
            <div className="text-xs opacity-60 truncate">
              {current?.country ? `${current.country} • ` : ""}
              {current?.codec ? `${current.codec}` : ""}
              {typeof current?.bitrate === "number" ? ` • ${current.bitrate}kbps` : ""}
              {stations.length ? ` • ${safeIdx + 1}/${stations.length}` : ""}
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
                else playCurrent();
              }}
              className="rounded-2xl px-4 py-2 bg-white text-black text-sm font-semibold hover:opacity-90 transition"
            >
              {isPlaying ? "Pausar" : "Tocar"}
            </button>

            <button
              onClick={prevStation}
              className="rounded-2xl px-3 py-2 bg-white/10 border border-white/10 text-sm hover:bg-white/15 transition"
              title="Anterior"
            >
              ◀︎
            </button>

            <button
              onClick={nextStation}
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
            value={Math.round(volume * 100)}
            onChange={(e) => {
              const a = audioRef.current;
              if (!a) return;
              const v = clamp(Number(e.target.value) / 100, 0, 1);
              a.volume = v;
              persistVolume(v);
            }}
            className="w-full"
          />
          <div className="text-xs opacity-70 w-10 text-right">{Math.round(volume * 100)}%</div>
        </div>

        {msg ? (
          <div className="px-4 pb-4">
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3 text-xs leading-relaxed opacity-90">
              {msg}
            </div>
          </div>
        ) : null}
      </div>

      <audio ref={audioRef} />
    </div>
  );
}
