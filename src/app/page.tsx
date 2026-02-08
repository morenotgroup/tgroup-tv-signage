"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AgencyBackdrop from "@/components/AgencyBackdrop";
import BrandStrip from "@/components/BrandStrip";
import MusicDock from "@/components/MusicDock";
import { SIGNAGE_CONFIG } from "@/config";
import { BIRTHDAYS, type Birthday } from "@/data/birthdays";

type SceneId = 0 | 1 | 2 | 3;

type WeatherData = {
  current?: {
    temperature_2m?: number;
    wind_speed_10m?: number;
    relative_humidity_2m?: number;
    weather_code?: number;
  };
};

type NewsItem = {
  title: string;
  link?: string;
  pubDate?: string;
  source?: string;
};

function formatTimePtBR(d: Date) {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatDatePtBR(d: Date) {
  return d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function weatherLabel(code?: number) {
  if (code === undefined) return "Atualizando";
  if ([0].includes(code)) return "Céu limpo";
  if ([1, 2].includes(code)) return "Parcialmente nublado";
  if ([3].includes(code)) return "Nublado";
  if ([45, 48].includes(code)) return "Neblina";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "Chuva";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Neve";
  if ([95, 96, 99].includes(code)) return "Tempestade";
  return "Condição variável";
}

function getTodayKey(now: Date) {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${month}-${day}`;
}

function parseBirthdayDate(reference: Date, date: string) {
  const [monthRaw, dayRaw] = date.split("-");
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  return new Date(reference.getFullYear(), month - 1, day, 12, 0, 0, 0);
}

export default function Page() {
  const [now, setNow] = useState(() => new Date());
  const [scene, setScene] = useState<SceneId>(0);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [tvMode, setTvMode] = useState(false);
  const [fullscreenHint, setFullscreenHint] = useState("");
  const [isDebug, setIsDebug] = useState(process.env.NODE_ENV === "development");

  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [posterFailures, setPosterFailures] = useState<Record<string, true>>({});

  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    const ms = Math.max(6000, Number(SIGNAGE_CONFIG.sceneDurationMs || 12000));
    tickRef.current = window.setInterval(() => {
      setScene((s) => ((s + 1) % 4) as SceneId);
      setLastSync(new Date());
    }, ms);

    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, []);

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const tvQuery = url.searchParams.get("tv");
      const debugQuery = url.searchParams.get("debug");
      const forcedTv = tvQuery === "1" || tvQuery === "true";
      const savedOn = localStorage.getItem("tgroup_tv_mode") === "1";
      setTvMode(forcedTv || savedOn);
      if (debugQuery === "1") setIsDebug(true);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const cls = "tgroup-tvmode";
    if (tvMode) document.documentElement.classList.add(cls);
    else document.documentElement.classList.remove(cls);

    try {
      localStorage.setItem("tgroup_tv_mode", tvMode ? "1" : "0");
    } catch {
      // ignore
    }
  }, [tvMode]);

  const onEnterFullscreen = useCallback(async () => {
    setFullscreenHint("");
    try {
      const el = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void>;
      };
      if (document.fullscreenElement) return;

      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
      } else {
        setFullscreenHint("Fullscreen indisponível neste navegador.");
        return;
      }
      if (isDebug) setFullscreenHint("Fullscreen ativo");
    } catch {
      if (isDebug) setFullscreenHint("Fullscreen bloqueado pelo navegador");
    }
  }, [isDebug]);

  useEffect(() => {
    if (!tvMode) return;
    void onEnterFullscreen();
  }, [tvMode, onEnterFullscreen]);

  useEffect(() => {
    let alive = true;

    const loadWeather = async () => {
      try {
        const r = await fetch("/api/weather", { cache: "no-store" });
        const data = await r.json();
        if (alive && data?.ok) setWeather(data.data as WeatherData);
      } catch {
        // ignore
      }
    };

    void loadWeather();
    const timer = window.setInterval(loadWeather, SIGNAGE_CONFIG.refreshWeatherMs);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let alive = true;

    const loadNews = async () => {
      try {
        const r = await fetch("/api/news", { cache: "no-store" });
        const data = await r.json();
        if (alive && data?.ok) setNews((data.items || []) as NewsItem[]);
      } catch {
        // ignore
      }
    };

    void loadNews();
    const timer = window.setInterval(loadNews, SIGNAGE_CONFIG.refreshNewsMs);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const birthdaysState = useMemo(() => {
    const todayKey = getTodayKey(now);
    const todayBirthdays = BIRTHDAYS.filter((b) => b.date === todayKey);
    const monthBirthdays = BIRTHDAYS.filter((b) => Number(b.date.slice(0, 2)) === now.getMonth() + 1).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    const upcoming = BIRTHDAYS.map((b) => ({ ...b, fullDate: parseBirthdayDate(now, b.date) }))
      .filter((b) => {
        const diff = b.fullDate.getTime() - now.getTime();
        return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
      })
      .sort((a, b) => a.fullDate.getTime() - b.fullDate.getTime());

    return { todayBirthdays, monthBirthdays, upcoming };
  }, [now]);

  const tickerText = useMemo(() => {
    const items = [
      "T.Group em movimento contínuo.",
      `${SIGNAGE_CONFIG.locationLabel}.`,
      weather?.current?.temperature_2m !== undefined
        ? `Agora: ${Math.round(weather.current.temperature_2m)}°C e ${weatherLabel(weather.current.weather_code)}.`
        : "Clima em atualização.",
      news[0]?.title ?? "Manchetes em atualização.",
      birthdaysState.todayBirthdays.length
        ? `Hoje celebramos ${birthdaysState.todayBirthdays.map((b) => b.name).join(", ")} 🎉`
        : "Confira os próximos aniversariantes da semana.",
    ];
    return items.join("  •  ");
  }, [weather, news, birthdaysState, now]);

  return (
    <div className="relative min-h-screen w-full bg-black text-white overflow-hidden">
      <AgencyBackdrop />

      <div className="relative z-10">
        <div className="stage">
          <div className="topRow">
            <BrandStrip />
            <div className="clock tvDrift">
              <div className="time">{formatTimePtBR(now)}</div>
              <div className="date capitalize">{formatDatePtBR(now)}</div>
            </div>
          </div>

          {tvMode ? (
            <div className="tvHud tvDriftAlt">
              <div className="tvStatusPill">TV Mode • {formatTimePtBR(now)}</div>
              {isDebug ? (
                <>
                  <button className="tvAction" onClick={onEnterFullscreen} type="button">
                    Tela cheia
                  </button>
                  <button className="tvAction ghost" onClick={() => setTvMode(false)} type="button">
                    Sair
                  </button>
                </>
              ) : null}
              {fullscreenHint ? <div className="tvHint">{fullscreenHint}</div> : null}
            </div>
          ) : null}

          <div className="main">
            <div className="sceneWrap card">
              <div className={`scene ${scene === 0 ? "active" : ""}`}>
                <h1 className="h1">Bem-vindos ao T.Group</h1>
                <p className="p">Conexões, experiências e cultura viva em um só ecossistema.</p>
                <div className="kpis">
                  <div className="kpi">
                    <div className="label">Agora</div>
                    <div className="value">{formatTimePtBR(now)}</div>
                  </div>
                  <div className="kpi">
                    <div className="label">Local</div>
                    <div className="value">Perdizes</div>
                  </div>
                  <div className="kpi">
                    <div className="label">Clima</div>
                    <div className="value">
                      {weather?.current?.temperature_2m !== undefined
                        ? `${Math.round(weather.current.temperature_2m)}°C`
                        : "--"}
                    </div>
                  </div>
                </div>
              </div>

              <div className={`scene ${scene === 1 ? "active" : ""}`}>
                <h2 className="h2">Clima em São Paulo</h2>
                <div className="grid2">
                  <div className="kpi">
                    <div className="label">Condição</div>
                    <div className="value">{weatherLabel(weather?.current?.weather_code)}</div>
                  </div>
                  <div className="list">
                    <div className="item">
                      <div className="title">Temperatura</div>
                      <div className="meta">
                        {weather?.current?.temperature_2m !== undefined
                          ? `${Math.round(weather.current.temperature_2m)}°C`
                          : "--"}
                      </div>
                    </div>
                    <div className="item">
                      <div className="title">Umidade</div>
                      <div className="meta">
                        {weather?.current?.relative_humidity_2m !== undefined
                          ? `${Math.round(weather.current.relative_humidity_2m)}%`
                          : "--"}
                      </div>
                    </div>
                    <div className="item">
                      <div className="title">Vento</div>
                      <div className="meta">
                        {weather?.current?.wind_speed_10m !== undefined
                          ? `${Math.round(weather.current.wind_speed_10m)} km/h`
                          : "--"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`scene ${scene === 2 ? "active" : ""}`}>
                <h2 className="h2">Aniversariantes</h2>
                {birthdaysState.todayBirthdays.length ? (
                  <div className="birthdayHero">
                    {birthdaysState.todayBirthdays.map((birthday: Birthday) => (
                      <div key={`${birthday.name}-${birthday.date}`} className="birthdayPosterWrap">
                        <div
                          className="birthdayPosterBlur"
                          style={birthday.posterPath ? { backgroundImage: `url(${birthday.posterPath})` } : undefined}
                        />
                        {birthday.posterPath && !posterFailures[birthday.posterPath] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={birthday.posterPath}
                            alt={birthday.name}
                            className="birthdayPoster"
                            onError={() =>
                              setPosterFailures((prev) => ({ ...prev, [birthday.posterPath as string]: true }))
                            }
                          />
                        ) : (
                          <div className="birthdayWordmark">{birthday.company}</div>
                        )}
                        <div className="birthdayCaption">
                          <strong>{birthday.name}</strong> • {birthday.company}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid2">
                    <div className="list">
                      <div className="label">No mês</div>
                      {birthdaysState.monthBirthdays.map((birthday) => (
                        <div key={`${birthday.name}-${birthday.date}`} className="item">
                          <div className="title">{birthday.name}</div>
                          <div className="meta">
                            {birthday.date} • {birthday.company}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="list">
                      <div className="label">Próximos 7 dias</div>
                      {birthdaysState.upcoming.length ? (
                        birthdaysState.upcoming.map((birthday) => (
                          <div key={`${birthday.name}-${birthday.date}`} className="item">
                            <div className="title">{birthday.name}</div>
                            <div className="meta">
                              {birthday.date} • {birthday.company}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="item">
                          <div className="title">Agenda tranquila</div>
                          <div className="meta">Sem aniversários na próxima semana</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className={`scene ${scene === 3 ? "active" : ""}`}>
                <h2 className="h2">Manchetes</h2>
                <div className="list">
                  {news.slice(0, 6).map((item, index) => (
                    <article key={`${item.title}-${index}`} className="item">
                      <div className="title">{item.title}</div>
                      <div className="meta">{item.source || "News"}</div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="footer tvDrift">
            <div className="ticker">
              <span>{tickerText}</span>
            </div>
            <div className="pill">Sync: {lastSync ? formatTimePtBR(lastSync) : "--"}</div>
          </div>
        </div>

        <MusicDock tvMode={tvMode} />
      </div>
    </div>
  );
}
