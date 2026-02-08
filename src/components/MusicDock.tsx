"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { RadioProfileId } from "@/lib/radioProfiles";

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
  label: string;
  count: number;
  stations: Station[];
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function MusicDock() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [profile, setProfile] = useState<RadioProfileId>("agency");
  const [stations, setStations] = useState<Station[]>([]);
  const [idx, setIdx] = useState(0);

  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);

  const current = useMemo(() => stations[idx], [stations, idx]);

  async function loadStations(p: RadioProfileId) {
    setLoading(true);
    try {
      const res = await fetch(`/api/radio?profile=${encodeURIComponent(p)}&limit=80`, {
        cache: "no-store",
      });
      const data = (await res.json()) as ApiResp;
      const list = (data?.stations || []).filter((s) => !!s.streamUrl);

      // embaralha um pouco pra não ficar sempre igual
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }

      setStations(list);
      setIdx(0);
    } catch {
      setStations([]);
      setIdx(0);
    } finally {
      setLoading(false);
    }
  }

  function nextStation() {
    setIdx((prev) => {
      if (stations.length <= 1) return 0;
      const next = (prev + 1) % stations.length;
      return next;
    });
  }

  async function tryPlay() {
    const a = audioRef.current;
    if (!a || !current?.streamUrl) return;

    a.src = current.streamUrl;
    a.crossOrigin = "anonymous";

    try {
      await a.play();
      setIsPlaying(true);
      setIsReady(true);
    } catch {
      // Autoplay com som pode ser bloqueado sem gesto do usuário
      setIsPlaying(false);
      setIsReady(false);
    }
  }

  function pause() {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    setIsPlaying(false);
  }

  // Carrega stations ao trocar profile
  useEffect(() => {
    loadStations(profile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // Quando stations muda / idx muda, tenta tocar se já estava tocando
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (!current?.streamUrl) return;

    if (isPlaying) {
      tryPlay();
    } else {
      // só prepara o src
      a.src = current.streamUrl;
      a.crossOrigin = "anonymous";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, stations]);

  // listeners de erro/fim
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const onError = () => {
      // troca de estação automaticamente se falhar
      nextStation();
    };
    const onEnded = () => {
      nextStation();
    };

    a.addEventListener("error", onError);
    a.addEventListener("ended", onEnded);

    return () => {
      a.removeEventListener("error", onError);
      a.removeEventListener("ended", onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stations]);

  // Se o player estiver tocando e trocarmos de estação, tenta tocar novamente
  useEffect(() => {
    if (isPlaying) tryPlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.streamUrl]);

  // volume padrão “ambiente”
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.volume = 0.35;
  }, []);

  const safeIdx = clamp(idx, 0, Math.max(0, stations.length - 1));

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[520px] max-w-[92vw]">
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
                else tryPlay();
              }}
              className="rounded-2xl px-4 py-2 bg-white text-black text-sm font-semibold hover:opacity-90 transition"
            >
              {isPlaying ? "Pausar" : "Tocar"}
            </button>

            <button
              onClick={nextStation}
              className="rounded-2xl px-3 py-2 bg-white/10 border border-white/10 text-sm hover:bg-white/15 transition"
              title="Próxima"
            >
              ▶︎▶︎
            </button>
          </div>
        </div>

        {!isReady && (
          <div className="px-4 pb-4">
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3 text-xs leading-relaxed opacity-90">
              <div className="font-semibold mb-1">Se o som não iniciar:</div>
              <div>
                Alguns browsers bloqueiam autoplay com som até você clicar no domínio (normal em TV/kiosk).  
                Aperta <b>Tocar</b> uma vez e depois fica estável. :contentReference[oaicite:4]{index=4}
              </div>
            </div>
          </div>
        )}
      </div>

      <audio ref={audioRef} />
    </div>
  );
}
