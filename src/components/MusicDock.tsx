"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  ok: boolean;
  profile?: RadioProfileId;
  label?: string;
  count?: number;
  stations?: Station[];
  error?: string;
};

type PlayerStatus =
  | "idle"
  | "loading"
  | "ready"
  | "buffering"
  | "playing"
  | "paused"
  | "blocked"
  | "error";

const LS_KEYS = {
  profile: "tgroup_tv_profile",
  volume: "tgroup_tv_volume",
  lastStationId: "tgroup_tv_last_station_id",
  favorites: "tgroup_tv_favorites",
};

const DEFAULT_VOLUME = 0.35;
const MAX_FAILS_BEFORE_REFETCH = 5;

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

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function MusicDock({ tvMode = false }: { tvMode?: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const switchingRef = useRef(false);
  const failsRef = useRef(0);
  const lastActionRef = useRef<number>(0);

  const [profile, setProfile] = useState<RadioProfileId>("agency");
  const [stations, setStations] = useState<Station[]>([]);
  const [idx, setIdx] = useState(0);

  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [msg, setMsg] = useState<string>("");
  const [armed, setArmed] = useState<boolean>(false); // “usuário já clicou uma vez”
  const [panelOpen, setPanelOpen] = useState(false);

  const [uiNudge, setUiNudge] = useState({ x: 0, y: 0 }); // anti burn-in
  const favorites = useMemo(() => {
    if (typeof window === "undefined") return {} as Record<string, true>;
    return safeJsonParse<Record<string, true>>(
      window.localStorage.getItem(LS_KEYS.favorites),
      {}
    );
  }, []);

  const [favMap, setFavMap] = useState<Record<string, true>>({});

  const current = stations.length ? stations[clamp(idx, 0, stations.length - 1)] : null;
  const triedAutoplayRef = useRef(false);

  // --- Boot: prefs
  useEffect(() => {
    try {
      const savedProfile = localStorage.getItem(LS_KEYS.profile) as RadioProfileId | null;
      if (savedProfile === "agency" || savedProfile === "focus" || savedProfile === "chill") {
        setProfile(savedProfile);
      }

      const savedVol = Number(localStorage.getItem(LS_KEYS.volume));
      const vol = Number.isFinite(savedVol) ? clamp(savedVol, 0, 1) : DEFAULT_VOLUME;

      // prepara audio
      const a = audioRef.current;
      if (a) {
        a.crossOrigin = "anonymous";
        a.preload = "none";
        a.volume = vol;
      }

      setFavMap(safeJsonParse<Record<string, true>>(localStorage.getItem(LS_KEYS.favorites), {}));
    } catch {
      // ignore
    }
  }, []);

  // anti burn-in sutil
  useEffect(() => {
    const t = setInterval(() => {
      const dx = Math.floor((Math.random() - 0.5) * 10); // -5..5
      const dy = Math.floor((Math.random() - 0.5) * 10);
      setUiNudge({ x: dx, y: dy });
    }, 6 * 60 * 1000); // a cada 6 min
    return () => clearInterval(t);
  }, []);

  // --- Load stations
  async function loadStations(p: RadioProfileId, reason: string) {
    const now = Date.now();
    // evita spam
    if (now - lastActionRef.current < 800 && reason !== "profile-change") return;
    lastActionRef.current = now;

    setStatus("loading");
    setMsg("");

    try {
      const res = await fetch(`/api/radio?profile=${encodeURIComponent(p)}&limit=80`, {
        cache: "no-store",
      });
      const data = (await res.json()) as ApiResp;

      if (!data?.ok) throw new Error(data?.error || "Falha ao carregar rádios");
      const list = (data?.stations || []).filter((s) => s?.streamUrl);

      if (!list.length) throw new Error("Sem rádios disponíveis nesse perfil");

      // favoritos primeiro, depois shuffle leve pra não repetir sempre igual
      const favs = safeJsonParse<Record<string, true>>(
        localStorage.getItem(LS_KEYS.favorites),
        {}
      );

      const favList = list.filter((s) => !!favs[s.id]);
      const rest = list.filter((s) => !favs[s.id]);

      const mixed = [...favList, ...shuffle(rest)];

      // tenta manter última estação
      let initialIdx = 0;
      try {
        const lastId = localStorage.getItem(LS_KEYS.lastStationId);
        if (lastId) {
          const found = mixed.findIndex((s) => s.id === lastId);
          if (found >= 0) initialIdx = found;
        }
      } catch {
        // ignore
      }

      setStations(mixed);
      setIdx(initialIdx);
      setStatus("ready");
      failsRef.current = 0;

      // prepara source (sem dar play se não estiver armado)
      const a = audioRef.current;
      if (a && mixed[initialIdx]?.streamUrl) {
        a.crossOrigin = "anonymous";
        a.src = mixed[initialIdx].streamUrl;
        a.load();
      }
    } catch (e: any) {
      setStations([]);
      setStatus("error");
      setMsg(e?.message ? String(e.message) : "Erro ao carregar rádios");
    }
  }

  // profile change
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEYS.profile, profile);
    } catch {
      // ignore
    }
    void loadStations(profile, "profile-change");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  useEffect(() => {
    if (!tvMode || !stations.length || !current) return;
    if (triedAutoplayRef.current) return;
    triedAutoplayRef.current = true;
    void playCurrent(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tvMode, stations.length, current?.id]);

  // --- Helpers persist
  function persistVolume(v: number) {
    try {
      localStorage.setItem(LS_KEYS.volume, String(v));
    } catch {
      // ignore
    }
  }

  function persistLastStation(id: string) {
    try {
      localStorage.setItem(LS_KEYS.lastStationId, id);
    } catch {
      // ignore
    }
  }

  function persistFavorites(next: Record<string, true>) {
    try {
      localStorage.setItem(LS_KEYS.favorites, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  function toggleFav(id: string) {
    setFavMap((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      persistFavorites(next);
      return next;
    });
  }

  // --- Playback
  async function playCurrent(userAction = false) {
    const a = audioRef.current;
    if (!a || !current?.streamUrl) return;

    setMsg("");
    if (userAction) setArmed(true);

    // evita loop
    if (switchingRef.current) return;

    switchingRef.current = true;
    setStatus("buffering");

    try {
      a.crossOrigin = "anonymous";
      a.src = current.streamUrl;
      a.load();

      const p = a.play();
      if (p) await p;

      setStatus("playing");
      persistLastStation(current.id);
      failsRef.current = 0;
    } catch {
      // autoplay bloqueado ou stream ruim
      if (!armed && !userAction) {
        setStatus("blocked");
        setMsg("Autoplay bloqueado pelo navegador.");
      } else {
        setStatus("blocked");
        setMsg("Áudio indisponível no momento.");
      }
    } finally {
      switchingRef.current = false;
    }
  }

  function pause() {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    setStatus("paused");
  }

  function nextStation(auto = false) {
    if (!stations.length) return;
    setIdx((v) => (v + 1) % stations.length);
    if (armed && (status === "playing" || status === "buffering" || auto)) {
      // o useEffect de idx vai tocar
    }
  }

  function prevStation() {
    if (!stations.length) return;
    setIdx((v) => (v - 1 + stations.length) % stations.length);
  }

  async function recover() {
    failsRef.current += 1;

    if (failsRef.current >= MAX_FAILS_BEFORE_REFETCH) {
      failsRef.current = 0;
      await loadStations(profile, "refetch-after-fails");
      // tenta tocar de novo (se armado)
      if (armed) {
        setTimeout(() => void playCurrent(false), 300);
      }
      return;
    }

    // tenta próxima estação
    setTimeout(() => {
      nextStation(true);
    }, 250);
  }

  // quando idx muda, prepara/toca dependendo do estado
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !current?.streamUrl) return;

    a.crossOrigin = "anonymous";
    a.src = current.streamUrl;
    a.load();

    if (armed && (status === "playing" || status === "buffering")) {
      void playCurrent(false);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, current?.streamUrl]);

  // eventos do audio: robustez
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const onPlaying = () => {
      setStatus("playing");
      setMsg("");
      failsRef.current = 0;
    };

    const onWaiting = () => {
      if (armed) setStatus("buffering");
    };

    const onError = () => {
      if (armed) {
        setStatus("error");
        setMsg("Stream falhou. Trocando automaticamente…");
        void recover();
      }
    };

    const onStalled = () => {
      if (armed) {
        setStatus("error");
        setMsg("Conexão instável. Recuperando…");
        void recover();
      }
    };

    const onEnded = () => {
      if (armed) nextStation(true);
    };

    a.addEventListener("playing", onPlaying);
    a.addEventListener("waiting", onWaiting);
    a.addEventListener("error", onError);
    a.addEventListener("stalled", onStalled);
    a.addEventListener("ended", onEnded);

    return () => {
      a.removeEventListener("playing", onPlaying);
      a.removeEventListener("waiting", onWaiting);
      a.removeEventListener("error", onError);
      a.removeEventListener("stalled", onStalled);
      a.removeEventListener("ended", onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, profile, stations.length, idx]);

  // volume atual
  const volume = useMemo(() => {
    const a = audioRef.current;
    return a?.volume ?? DEFAULT_VOLUME;
  }, [status]);

  const statusChip =
    status === "playing"
      ? "LIVE"
      : status === "buffering"
      ? "BUFFERING"
      : status === "blocked"
      ? "TAP TO PLAY"
      : status === "paused"
      ? "PAUSED"
      : status === "loading"
      ? "LOADING"
      : status === "error"
      ? "RECOVER"
      : "READY";

  const profileLabel = profile === "agency" ? "Agência" : profile === "focus" ? "Focus" : "Chill";
  const subtitle =
    profile === "agency"
      ? "Energia de recepção • mood agência"
      : profile === "focus"
      ? "Trampo • sem estresse"
      : "Lounge • chill reception";

  return (
    <div
      className="fixed bottom-6 right-6 z-50 max-w-[94vw]"
      style={{ transform: `translate(${uiNudge.x}px, ${uiNudge.y}px)` }}
    >
      <audio ref={audioRef} />

      <div className="relative overflow-hidden rounded-[28px] border border-white/15 bg-gradient-to-br from-white/12 via-white/8 to-white/5 backdrop-blur-2xl shadow-[0_24px_90px_rgba(0,0,0,0.55)]">
        {/* glow */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 -bottom-24 h-64 w-64 rounded-full bg-white/8 blur-3xl" />

        <div className="p-5 text-white">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-2xl border border-white/15 bg-white/10">
              {current?.favicon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={current.favicon}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <span className="text-xl">♫</span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/70">
                <span className="rounded-full border border-white/20 bg-white/10 px-2 py-1">
                  {statusChip}
                </span>
                <span>{profileLabel}</span>
                <span className="text-white/40">•</span>
                <span className="normal-case tracking-normal text-white/60">{subtitle}</span>
              </div>

              <div className="mt-1 flex items-center gap-2">
                <div className="truncate text-lg font-semibold leading-tight">
                  {status === "loading" ? "Carregando rádios…" : current?.name || "Sem estação"}
                </div>
                {current?.id ? (
                  <button
                    onClick={() => toggleFav(current.id)}
                    className="ml-auto rounded-xl border border-white/15 bg-white/10 px-3 py-1 text-xs hover:bg-white/15 transition"
                    title="Favoritar"
                  >
                    {favMap[current.id] ? "★ Fav" : "☆ Fav"}
                  </button>
                ) : null}
              </div>

              <div className="mt-1 text-xs text-white/60 truncate">
                {msg ? msg : current ? `${current.country ?? ""} ${current.codec ? `• ${current.codec}` : ""} ${
                  typeof current.bitrate === "number" ? `• ${current.bitrate}kbps` : ""
                } ${stations.length ? `• ${clamp(idx, 0, stations.length - 1) + 1}/${stations.length}` : ""}` : ""}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {/* presets */}
            <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 p-1">
              {(["agency", "focus", "chill"] as RadioProfileId[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setProfile(p)}
                  className={`h-10 rounded-2xl px-4 text-sm font-semibold transition ${
                    profile === p ? "bg-white text-black" : "text-white/80 hover:bg-white/10"
                  }`}
                  title="Preset"
                >
                  {p === "agency" ? "Agência" : p === "focus" ? "Focus" : "Chill"}
                </button>
              ))}
            </div>

            {/* controls */}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={prevStation}
                className="h-11 w-11 rounded-2xl border border-white/15 bg-white/10 text-sm hover:bg-white/15 transition"
                title="Anterior"
              >
                ◀
              </button>

              <button
                onClick={() => {
                  if (status === "playing") pause();
                  else void playCurrent(true);
                }}
                className="h-11 min-w-[150px] rounded-2xl bg-white px-5 text-sm font-semibold text-black hover:opacity-90 transition"
                title="Tocar / Pausar"
              >
                {status === "blocked" ? "Ativar som" : status === "playing" ? "Pausar" : "Tocar"}
              </button>

              <button
                onClick={() => nextStation(true)}
                className="h-11 w-11 rounded-2xl border border-white/15 bg-white/10 text-sm hover:bg-white/15 transition"
                title="Próxima"
              >
                ▶
              </button>

              <button
                onClick={() => setPanelOpen((v) => !v)}
                className="h-11 rounded-2xl border border-white/15 bg-white/10 px-4 text-sm hover:bg-white/15 transition"
                title="Lista"
              >
                Lista
              </button>
            </div>
          </div>

          {/* volume */}
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
            <div className="text-xs uppercase tracking-widest text-white/70 w-20">Volume</div>
            <input
              aria-label="Volume"
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
            <div className="text-xs text-white/70 w-12 text-right">{Math.round(volume * 100)}%</div>
          </div>

          {/* station panel */}
          {panelOpen ? (
            <div className="mt-4 max-h-[320px] overflow-auto rounded-2xl border border-white/15 bg-black/35 p-3">
              <div className="mb-2 text-xs uppercase tracking-widest text-white/60">
                Estações ({stations.length})
              </div>

              <div className="grid gap-2">
                {stations.slice(0, 40).map((s, i) => {
                  const active = i === idx;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setIdx(i)}
                      className={`flex items-center gap-3 rounded-2xl border px-3 py-2 text-left transition ${
                        active
                          ? "border-white/30 bg-white/15"
                          : "border-white/10 bg-white/5 hover:bg-white/10"
                      }`}
                    >
                      <div className="w-6 text-xs text-white/60">{String(i + 1).padStart(2, "0")}</div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{s.name}</div>
                        <div className="truncate text-xs text-white/60">
                          {s.country ?? ""} {s.codec ? `• ${s.codec}` : ""}{" "}
                          {typeof s.bitrate === "number" ? `• ${s.bitrate}kbps` : ""}
                        </div>
                      </div>
                      <div className="text-xs text-white/60">
                        {favMap[s.id] ? "★" : ""}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex items-center justify-between">
                <button
                  onClick={() => void loadStations(profile, "manual-reload")}
                  className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm hover:bg-white/15 transition"
                >
                  ↻ Recarregar
                </button>
                <button
                  onClick={() => setPanelOpen(false)}
                  className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm hover:bg-white/15 transition"
                >
                  Fechar
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
