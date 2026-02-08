"use client";

import { useEffect, useMemo, useState } from "react";
import MusicDock from "@/components/MusicDock";
import { SIGNAGE_CONFIG } from "@/config";

type WeatherState =
  | {
      ok: true;
      tempC: number;
      humidity: number;
      windKmh: number;
      code: number;
      source: string;
    }
  | { ok: false; error: string; source: string };

type NewsItem = {
  title: string;
  link: string;
  pubDate: string;
  source: string;
};

type Birthday = { name: string; month: number; day: number; team?: string };

function formatDatePtBR(d: Date) {
  return d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatTimePtBR(d: Date) {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function weatherLabel(code: number) {
  if ([0].includes(code)) return "Céu limpo";
  if ([1, 2, 3].includes(code)) return "Parcialmente nublado";
  if ([45, 48].includes(code)) return "Neblina";
  if ([51, 53, 55, 56, 57].includes(code)) return "Garoa";
  if ([61, 63, 65, 66, 67].includes(code)) return "Chuva";
  if ([71, 73, 75, 77].includes(code)) return "Neve";
  if ([80, 81, 82].includes(code)) return "Pancadas";
  if ([95, 96, 99].includes(code)) return "Tempestade";
  return "Tempo";
}

export default function Page() {
  const [tvMode, setTvMode] = useState(false);
  const [fullscreenHint, setFullscreenHint] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [scene, setScene] = useState(0);

  const [weather, setWeather] = useState<WeatherState>({
    ok: false,
    error: "carregando…",
    source: "open-meteo",
  });

  const [news, setNews] = useState<NewsItem[]>([]);
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tvParam = params.get("tv");
    const tvFromQuery = tvParam === "1";
    const tvFromStorage = window.localStorage.getItem("tvMode") === "1";
    const isTvMode = tvParam !== null ? tvFromQuery : tvFromStorage;

    setTvMode(isTvMode);
    document.body.classList.toggle("tv-mode", isTvMode);
    window.localStorage.setItem("tvMode", isTvMode ? "1" : "0");

    return () => {
      document.body.classList.remove("tv-mode", "tv-cursor-hidden");
    };
  }, []);

  useEffect(() => {
    if (!tvMode) {
      document.body.classList.remove("tv-cursor-hidden");
      return;
    }

    let hideCursorTimeout = window.setTimeout(() => {
      document.body.classList.add("tv-cursor-hidden");
    }, 3000);

    const onPointerMove = () => {
      document.body.classList.remove("tv-cursor-hidden");
      window.clearTimeout(hideCursorTimeout);
      hideCursorTimeout = window.setTimeout(() => {
        document.body.classList.add("tv-cursor-hidden");
      }, 3000);
    };

    const preventDefault = (event: Event) => event.preventDefault();
    const preventKeyboardScroll = (event: KeyboardEvent) => {
      const blockedKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", " "];
      if (blockedKeys.includes(event.key)) event.preventDefault();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("wheel", preventDefault, { passive: false });
    window.addEventListener("touchmove", preventDefault, { passive: false });
    window.addEventListener("keydown", preventKeyboardScroll, { passive: false });

    return () => {
      window.clearTimeout(hideCursorTimeout);
      document.body.classList.remove("tv-cursor-hidden");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("wheel", preventDefault);
      window.removeEventListener("touchmove", preventDefault);
      window.removeEventListener("keydown", preventKeyboardScroll);
    };
  }, [tvMode]);

  async function onEnterFullscreen() {
    setFullscreenHint(null);
    try {
      if (!document.fullscreenEnabled) {
        setFullscreenHint("Seu navegador bloqueou fullscreen. Use F11 ou menu do navegador.");
        return;
      }
      await document.documentElement.requestFullscreen();
    } catch {
      setFullscreenHint("Não foi possível entrar em fullscreen. Tente F11 ou menu do navegador.");
    }
  }

  // relógio
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // rotação
  useEffect(() => {
    const t = setInterval(() => {
      setScene((s) => (s + 1) % 4);
    }, SIGNAGE_CONFIG.sceneDurationMs);
    return () => clearInterval(t);
  }, []);

  // carga de dados
  useEffect(() => {
    let alive = true;

    async function loadAll() {
      try {
        const [w, n, b] = await Promise.all([
          fetch("/api/weather", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/news", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/birthdays", { cache: "no-store" }).then((r) => r.json()),
        ]);

        if (!alive) return;

        if (w?.ok && w?.data?.current) {
          const c = w.data.current;
          setWeather({
            ok: true,
            tempC: Number(c.temperature_2m ?? 0),
            humidity: Number(c.relative_humidity_2m ?? 0),
            windKmh: Number(c.wind_speed_10m ?? 0),
            code: Number(c.weather_code ?? 0),
            source: "open-meteo",
          });
        } else {
          setWeather({
            ok: false,
            error: w?.error ?? "Falha no clima",
            source: "open-meteo",
          });
        }

        if (n?.ok && Array.isArray(n.items)) {
          setNews(n.items as NewsItem[]);
        } else {
          setNews([]);
        }

        if (b?.ok && Array.isArray(b.birthdays)) {
          setBirthdays(b.birthdays as Birthday[]);
        } else {
          setBirthdays([]);
        }

        setLastSync(new Date());
      } catch {
        if (!alive) return;
        setWeather({
          ok: false,
          error: "Sem conexão com as APIs",
          source: "open-meteo",
        });
        setNews([]);
      }
    }

    loadAll();

    const tw = setInterval(loadAll, SIGNAGE_CONFIG.refreshWeatherMs);
    const tn = setInterval(loadAll, SIGNAGE_CONFIG.refreshNewsMs);

    return () => {
      alive = false;
      clearInterval(tw);
      clearInterval(tn);
    };
  }, []);

  const birthdaysOfMonth = useMemo(() => {
    const m = now.getMonth() + 1;
    return birthdays
      .filter((x) => x.month === m)
      .sort((a, b) => a.day - b.day);
  }, [birthdays, now]);

  const todayBirthdays = useMemo(() => {
    const m = now.getMonth() + 1;
    const d = now.getDate();
    return birthdays.filter((x) => x.month === m && x.day === d);
  }, [birthdays, now]);

  const tickerText = useMemo(() => {
    const pieces: string[] = [];
    pieces.push(`${SIGNAGE_CONFIG.companyName} — ${SIGNAGE_CONFIG.locationLabel}`);
    if (weather.ok) pieces.push(`${Math.round(weather.tempC)}°C • ${weatherLabel(weather.code)}`);
    if (birthdaysOfMonth.length) {
      pieces.push(
        `Aniversariantes do mês: ${birthdaysOfMonth
          .slice(0, 12)
          .map((b) => `${b.name} (${pad2(b.day)}/${pad2(b.month)})`)
          .join(" • ")}`
      );
    }
    if (news.length) pieces.push(`Manchetes: ${news.slice(0, 6).map((n) => n.title).join(" • ")}`);
    return pieces.join("  —  ");
  }, [weather, birthdaysOfMonth, news]);

  return (
    <div className="stage">
      {/* Dock fixo de música (Radio Browser). Fica por cima e você liga quando quiser */}
      <MusicDock />

      <div className="topRow tvDrift">
        <div className="brand tvDriftAlt">
          <div className="brandMark" />
          <div className="brandText">
            <div className="name">{SIGNAGE_CONFIG.companyName}</div>
            <div className="sub">TV Signage • {SIGNAGE_CONFIG.locationLabel}</div>
          </div>
        </div>

        <div className="clock tvDrift">
          <div className="time">{formatTimePtBR(now)}</div>
          <div className="date">{formatDatePtBR(now)}</div>
        </div>
      </div>

      {tvMode ? (
        <div className="tvHud tvDriftAlt">
          <div className="tvStatusPill">TV • {formatTimePtBR(now)} • Sync {lastSync ? formatTimePtBR(lastSync) : "—"}</div>
          <button className="tvAction" onClick={onEnterFullscreen} type="button">
            Tela cheia
          </button>
          {fullscreenHint ? <div className="tvHint">{fullscreenHint}</div> : null}
        </div>
      ) : null}

      <div className="main">
        <div className="sceneWrap card">
          {/* Cena 0: Boas-vindas */}
          <div className={`scene ${scene === 0 ? "active" : ""}`}>
            <h1 className="h1">Bem-vindos 👋</h1>
            <p className="p">
              Uma experiência viva para recepção: clima, aniversariantes do mês, manchetes e recados — com cara de
              prédio premium.
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
          </div>

          {/* Cena 1: Clima */}
          <div className={`scene ${scene === 1 ? "active" : ""}`}>
            <h1 className="h1">Clima agora</h1>
            <p className="p">Atualiza automaticamente. Ótimo pra entrada/saída e dia de evento.</p>

            <div className="kpis">
              <div className="kpi">
                <div className="label">Temperatura</div>
                <div className="value">{weather.ok ? `${Math.round(weather.tempC)}°C` : "—"}</div>
              </div>
              <div className="kpi">
                <div className="label">Umidade</div>
                <div className="value">{weather.ok ? `${Math.round(weather.humidity)}%` : "—"}</div>
              </div>
              <div className="kpi">
                <div className="label">Vento</div>
                <div className="value">{weather.ok ? `${Math.round(weather.windKmh)} km/h` : "—"}</div>
              </div>
            </div>

            <div className="item">
              <div>
                <div className="title">
                  {weather.ok ? weatherLabel(weather.code) : "Sem dados no momento"}
                </div>
                <div className="meta">
                  {weather.ok ? `Fonte: ${weather.source}` : (weather as any).error}
                </div>
              </div>
              <div className="pill">Auto</div>
            </div>
          </div>

          {/* Cena 2: Aniversariantes */}
          <div className={`scene ${scene === 2 ? "active" : ""}`}>
            <h1 className="h1">Aniversariantes do mês 🎂</h1>
            <p className="p">
              Mesmo se hoje não tiver ninguém, a TV mantém o clima bom mostrando o mês inteiro.
            </p>

            <div className="grid2">
              <div className="card" style={{ height: "100%" }}>
                <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>
                  Hoje
                </div>

                {todayBirthdays.length ? (
                  <div className="list">
                    {todayBirthdays.map((b) => (
                      <div className="item" key={`${b.name}-${b.day}-${b.month}`}>
                        <div className="title">{b.name}</div>
                        <div className="meta">{b.team ?? "—"}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="item">
                    <div>
                      <div className="title">Sem aniversariantes hoje</div>
                      <div className="meta">Mas o mês tá cheio — olha do lado 😉</div>
                    </div>
                    <div className="pill">Mês</div>
                  </div>
                )}
              </div>

              <div className="card" style={{ height: "100%" }}>
                <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>
                  No mês
                </div>

                <div className="list">
                  {birthdaysOfMonth.length ? (
                    birthdaysOfMonth.slice(0, 10).map((b) => (
                      <div className="item" key={`${b.name}-${b.day}-${b.month}`}>
                        <div className="title">{b.name}</div>
                        <div className="meta">
                          {pad2(b.day)}/{pad2(b.month)} • {b.team ?? "—"}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="item">
                      <div className="title">Sem dados do mês</div>
                      <div className="meta">Depois a gente liga no Google Sheets.</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Cena 3: Notícias */}
          <div className={`scene ${scene === 3 ? "active" : ""}`}>
            <h1 className="h1">Manchetes</h1>
            <p className="p">Giro rápido só pra manter a recepção com energia de “prédio premium”.</p>

            <div className="list" style={{ marginTop: 10 }}>
              {news.length ? (
                news.slice(0, 10).map((n, idx) => (
                  <div className="item" key={`${idx}-${n.title}`}>
                    <div className="title">{n.title}</div>
                    <div className="meta">{n.source || "Google News"}</div>
                  </div>
                ))
              ) : (
                <div className="item">
                  <div className="title">Sem manchetes no momento</div>
                  <div className="meta">Quando voltar a conexão, preenche sozinho.</div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="footer tvDrift">
          <div className="ticker">
            <span>{tickerText}</span>
          </div>
          <div className="pill">
            {lastSync ? `Sync: ${formatTimePtBR(lastSync)}` : "Sync: —"}
          </div>
        </div>
      </div>
    </div>
  );
}
