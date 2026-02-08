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
};

type ProfileKey = "agency" | "focus" | "chill";

type MusicDockPrefs = {
  volume: number;
  shuffle: boolean;
  profile: ProfileKey;
  lastStationId?: string;
};

type PlayerStatus =
  | "idle"
  | "buffering"
  | "playing"
  | "paused"
  | "error"
  | "blocked";

const PREFS_KEY = "musicDockPrefs";
const MAX_CONSECUTIVE_FAILURES = 4;

const PROFILE_CONFIG: Record<
  ProfileKey,
  { label: string; tag: string; subtitle: string }
> = {
  agency: { label: "Agency", tag: "lofi", subtitle: "Brand-safe groove" },
  focus: { label: "Focus", tag: "jazz", subtitle: "Deep work, low noise" },
  chill: { label: "Chill", tag: "chill", subtitle: "Lounge reception vibe" },
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function MusicDock() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRecoveryRef = useRef(0);
  const failureCountRef = useRef(0);

  const [enabled, setEnabled] = useState(false);
  const [loadingStations, setLoadingStations] = useState(true);
  const [stations, setStations] = useState<Station[]>([]);
  const [idx, setIdx] = useState(0);

  const [volume, setVolume] = useState(0.25);
  const [shuffle, setShuffle] = useState(false);
  const [profile, setProfile] = useState<ProfileKey>("agency");
  const [lastStationId, setLastStationId] = useState<string | undefined>(
    undefined,
  );
  const [status, setStatus] = useState<PlayerStatus>("idle");

  const station = useMemo(() => stations[idx], [stations, idx]);

  function clearRetryTimer() {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }

  function pickRandomIndex(current: number, total: number) {
    if (total <= 1) return current;
    let next = current;
    while (next === current) {
      next = Math.floor(Math.random() * total);
    }
    return next;
  }

  async function loadStations(targetProfile: ProfileKey) {
    setLoadingStations(true);
    try {
      const profileCfg = PROFILE_CONFIG[targetProfile];
      const r = await fetch(
        `/api/radio?tag=${encodeURIComponent(profileCfg.tag)}&profile=${encodeURIComponent(targetProfile)}&countrycode=BR&limit=80`,
        { cache: "no-store" },
      );
      const j = (await r.json()) as ApiResp;
      if (!j?.ok || !Array.isArray(j.stations) || j.stations.length === 0) {
        throw new Error("Sem estações retornadas.");
      }

      const nextStations = j.stations;
      const preferredIndex = lastStationId
        ? nextStations.findIndex((s) => s.stationuuid === lastStationId)
        : -1;

      setStations(nextStations);
      setIdx(preferredIndex >= 0 ? preferredIndex : 0);
      setStatus((current) => (enabled ? current : "idle"));
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

  function scheduleStationAdvance() {
    const failures = failureCountRef.current;
    const backoffMs = Math.min(1200 * 2 ** Math.max(0, failures - 1), 7000);
    clearRetryTimer();
    retryTimerRef.current = setTimeout(() => {
      nextStation();
    }, backoffMs);
  }

  async function recoverFromFailure() {
    if (!enabled) return;

    const now = Date.now();
    if (now - lastRecoveryRef.current < 900) {
      return;
    }
    lastRecoveryRef.current = now;

    setStatus("error");
    failureCountRef.current += 1;

    if (failureCountRef.current >= MAX_CONSECUTIVE_FAILURES) {
      failureCountRef.current = 0;
      await loadStations(profile);
      return;
    }

    scheduleStationAdvance();
  }

  async function playCurrent() {
    const audio = audioRef.current;
    if (!audio || !station) return;

    clearRetryTimer();

    try {
      setStatus("buffering");
      audio.src = station.url_resolved;
      audio.load();
      audio.volume = volume;

      const p = audio.play();
      if (p) await p;
    } catch {
      setStatus("blocked");
    }
  }

  function pause() {
    const audio = audioRef.current;
    if (!audio) return;
    clearRetryTimer();
    audio.pause();
    setStatus("paused");
  }

  useEffect(() => {
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
      if (
        parsed.profile === "agency" ||
        parsed.profile === "focus" ||
        parsed.profile === "chill"
      ) {
        setProfile(parsed.profile);
      }
      if (typeof parsed.lastStationId === "string" && parsed.lastStationId) {
        setLastStationId(parsed.lastStationId);
      }
    } catch {
      // ignore invalid localStorage payload
    }
  }, []);

  useEffect(() => {
    loadStations(profile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  useEffect(() => {
    try {
      const prefs: MusicDockPrefs = {
        volume,
        shuffle,
        profile,
        lastStationId,
      };
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // ignore localStorage failures
    }
  }, [shuffle, volume, profile, lastStationId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (!station?.stationuuid) return;
    setLastStationId(station.stationuuid);
  }, [station?.stationuuid]);

  useEffect(() => {
    if (!enabled || !station) return;
    playCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, enabled]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlaying = () => {
      failureCountRef.current = 0;
      setStatus("playing");
    };
    const onWaiting = () => {
      if (!enabled) return;
      setStatus("buffering");
    };
    const onStalled = () => {
      void recoverFromFailure();
    };
    const onEnded = () => {
      if (!enabled) return;
      nextStation();
    };
    const onError = () => {
      void recoverFromFailure();
    };

    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("stalled", onStalled);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("stalled", onStalled);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, stations.length, profile]);

  useEffect(() => {
    return () => {
      clearRetryTimer();
    };
  }, []);

  const stateChip =
    status === "playing"
      ? "LIVE"
      : status === "buffering"
        ? "BUFFERING"
        : status === "blocked"
          ? "TAP TO PLAY"
          : status === "paused"
            ? "PAUSED"
            : status === "error"
              ? "RECOVERING"
              : "READY";

  const profileCfg = PROFILE_CONFIG[profile];
  const panelClass =
    "w-[min(96vw,1100px)] rounded-[28px] border border-white/20 bg-gradient-to-br from-white/16 via-white/8 to-white/4 backdrop-blur-2xl shadow-[0_24px_90px_rgba(0,0,0,0.45)]";
  const buttonClass =
    "h-12 min-w-12 rounded-2xl border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/20 transition";

  return (
    <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
      <audio ref={audioRef} preload="none" />

      <div className={`${panelClass} px-6 py-5 text-white`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-2xl border border-white/20 bg-white/10">
              {station?.favicon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={station.favicon}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display =
                      "none";
                  }}
                />
              ) : (
                <span className="text-xl">♫</span>
              )}
            </div>

            <div className="min-w-[260px] max-w-[580px]">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/70">
                <span className="rounded-full border border-white/25 bg-white/10 px-2 py-1">
                  {stateChip}
                </span>
                <span>{profileCfg.label}</span>
                <span className="text-white/40">•</span>
                <span>{profileCfg.subtitle}</span>
              </div>
              <div className="mt-1 truncate text-xl font-semibold leading-tight">
                {loadingStations
                  ? "Carregando rádios..."
                  : station?.name || "Sem estação"}
              </div>
              <div className="text-xs text-white/60">
                {enabled
                  ? "Recepção ao vivo"
                  : "Toque em Ativar para liberar áudio no navegador"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              className={buttonClass}
              onClick={prevStation}
              title="Anterior"
            >
              ◀
            </button>

            {!enabled || status === "paused" || status === "blocked" ? (
              <button
                className={`${buttonClass} h-14 min-w-[170px] bg-white/20 text-base`}
                onClick={async () => {
                  setEnabled(true);
                  await playCurrent();
                }}
                title="Ativar"
              >
                ▶ Ativar
              </button>
            ) : (
              <button
                className={`${buttonClass} h-14 min-w-[170px] text-base`}
                onClick={pause}
                title="Pausar"
              >
                ❚❚ Pausar
              </button>
            )}

            <button
              className={buttonClass}
              onClick={nextStation}
              title="Próxima"
            >
              ▶
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_auto_auto_auto] md:items-center">
          <select
            aria-label="Perfil"
            className="h-12 rounded-2xl border border-white/20 bg-white/10 px-4 text-sm"
            value={profile}
            onChange={(e) => setProfile(e.target.value as ProfileKey)}
          >
            <option value="agency">Agency</option>
            <option value="focus">Focus</option>
            <option value="chill">Chill</option>
          </select>

          <select
            aria-label="Estação"
            className="h-12 rounded-2xl border border-white/20 bg-white/10 px-4 text-sm"
            value={station?.stationuuid || ""}
            onChange={(e) => {
              const next = stations.findIndex(
                (s) => s.stationuuid === e.target.value,
              );
              if (next >= 0) setIdx(next);
            }}
          >
            {stations.map((s) => (
              <option key={s.stationuuid} value={s.stationuuid}>
                {s.name}
              </option>
            ))}
          </select>

          <button
            className={`${buttonClass} ${shuffle ? "bg-white/25" : ""}`}
            onClick={() => setShuffle((v) => !v)}
            title="Modo aleatório"
          >
            🔀 {shuffle ? "Shuffle" : "Sequência"}
          </button>

          <div className="flex h-12 items-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-4">
            <span className="text-xs uppercase tracking-wide text-white/70">
              Vol
            </span>
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
            <span className="text-xs text-white/70">
              {Math.round(volume * 100)}%
            </span>
          </div>

          <button
            className={buttonClass}
            onClick={() => {
              void loadStations(profile);
            }}
            title="Recarregar"
          >
            ↻ Recarregar
          </button>
        </div>
      </div>
    </div>
  );
}
