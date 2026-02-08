"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Station = {
  stationuuid: string;
  name: string;
  url_resolved: string;
  favicon?: string;
  tags?: string;
  countrycode?: string;
  codec?: string;
  bitrate?: number;
};

type ApiResp = {
  ok: boolean;
  stations: Station[];
  tag: string;
  countrycode: string;
};

const PREFS_KEY = "musicDockPrefs";

type MusicDockPrefs = {
  volume: number;
  shuffle: boolean;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function MusicDock() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [loadingStations, setLoadingStations] = useState(true);
  const [stations, setStations] = useState<Station[]>([]);
  const [idx, setIdx] = useState(0);

  const [volume, setVolume] = useState(0.25);
  const [shuffle, setShuffle] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "loading" | "playing" | "paused" | "error"
  >("idle");

  const station = useMemo(() => stations[idx], [stations, idx]);

  function pickRandomIndex(current: number, total: number) {
    if (total <= 1) return current;
    let next = current;
    while (next === current) {
      next = Math.floor(Math.random() * total);
    }
    return next;
  }

  async function loadStations() {
    setLoadingStations(true);
    try {
      const r = await fetch("/api/radio?tag=lofi&countrycode=BR&limit=120", {
        cache: "no-store",
      });
      const j = (await r.json()) as ApiResp;
      if (!j?.ok || !Array.isArray(j.stations) || j.stations.length === 0) {
        throw new Error("Sem estações retornadas.");
      }

      setStations(j.stations);
      setIdx(0);
      setStatus("idle");
    } catch {
      setStations([]);
      setIdx(0);
      setStatus("error");
    } finally {
      setLoadingStations(false);
    }
  }

  function nextStation() {
    if (!stations.length) return;
    setIdx((v) =>
      shuffle ? pickRandomIndex(v, stations.length) : (v + 1) % stations.length,
    );
  }

  function prevStation() {
    if (!stations.length) return;
    setIdx((v) => (v - 1 + stations.length) % stations.length);
  }

  async function playCurrent() {
    const audio = audioRef.current;
    if (!audio || !station) return;

    try {
      setStatus("loading");
      audio.src = station.url_resolved;
      audio.load();
      audio.volume = volume;

      const p = audio.play();
      if (p) await p;

      setStatus("playing");
    } catch {
      setStatus("error");
      nextStation();
    }
  }

  function pause() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setStatus("paused");
  }

  useEffect(() => {
    loadStations();

    try {
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as Partial<MusicDockPrefs>;
      if (typeof parsed.volume === "number") {
        setVolume(clamp(parsed.volume, 0, 1));
      }
      if (typeof parsed.shuffle === "boolean") {
        setShuffle(parsed.shuffle);
      }
    } catch {
      // ignore invalid localStorage payload
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      const prefs: MusicDockPrefs = { volume, shuffle };
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // ignore localStorage failures
    }
  }, [shuffle, volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (!enabled) return;
    if (!station) return;
    playCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, enabled]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onError = () => {
      if (!enabled) return;
      setStatus("error");
      nextStation();
    };
    const onStalled = () => {
      if (!enabled) return;
      setStatus("error");
      nextStation();
    };
    const onEnded = () => {
      if (!enabled) return;
      nextStation();
    };

    audio.addEventListener("error", onError);
    audio.addEventListener("stalled", onStalled);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("error", onError);
      audio.removeEventListener("stalled", onStalled);
      audio.removeEventListener("ended", onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, stations.length]);

  const pill =
    "rounded-full border border-white/10 bg-white/5 backdrop-blur-xl shadow-lg";

  return (
    <div className="fixed bottom-6 left-6 z-50">
      <audio ref={audioRef} preload="none" />

      <div className={`${pill} px-5 py-3 flex items-center gap-4`}>
        <div className="w-10 h-10 rounded-2xl bg-white/10 grid place-items-center overflow-hidden">
          {station?.favicon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={station.favicon}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <span className="text-xs opacity-70">♫</span>
          )}
        </div>

        <div className="min-w-[320px] max-w-[520px]">
          <div className="text-xs opacity-60">
            Música (Radio Browser) • volume {Math.round(volume * 100)}%
          </div>
          <div className="text-lg font-medium leading-tight truncate">
            {loadingStations
              ? "Carregando rádios..."
              : station?.name || "Sem estação"}
          </div>
          <div className="text-xs opacity-50">
            Status:{" "}
            {enabled
              ? status === "playing"
                ? "tocando"
                : status === "loading"
                  ? "carregando"
                  : status === "paused"
                    ? "pausado"
                    : status === "error"
                      ? "erro"
                      : "pronto"
              : "desligado (clique para ativar)"}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className={`${pill} px-3 py-2 text-sm hover:bg-white/10 transition`}
            onClick={prevStation}
            title="Anterior"
          >
            ◀
          </button>

          {!enabled || status !== "playing" ? (
            <button
              className={`${pill} px-4 py-2 text-sm hover:bg-white/10 transition`}
              onClick={async () => {
                setEnabled(true);
                await playCurrent();
              }}
              title="Ativar / Play"
            >
              ▶ Ativar
            </button>
          ) : (
            <button
              className={`${pill} px-4 py-2 text-sm hover:bg-white/10 transition`}
              onClick={() => pause()}
              title="Pausar"
            >
              ❚❚ Pausar
            </button>
          )}

          <button
            className={`${pill} px-3 py-2 text-sm hover:bg-white/10 transition`}
            onClick={nextStation}
            title="Próxima"
          >
            ▶
          </button>
        </div>

        <div className="flex items-center gap-3 pl-2">
          <button
            className={`${pill} px-3 py-2 text-sm hover:bg-white/10 transition ${
              shuffle ? "bg-white/15" : ""
            }`}
            onClick={() => setShuffle((v) => !v)}
            title="Modo aleatório"
          >
            🔀 {shuffle ? "Aleatório" : "Sequencial"}
          </button>
          <input
            aria-label="Volume"
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={(e) =>
              setVolume(clamp(Number(e.target.value) / 100, 0, 1))
            }
          />
          <button
            className={`${pill} px-3 py-2 text-sm hover:bg-white/10 transition`}
            onClick={() => loadStations()}
            title="Recarregar lista"
          >
            ↻
          </button>
        </div>
      </div>
    </div>
  );
}
