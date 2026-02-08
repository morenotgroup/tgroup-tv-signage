"use client";

import { useEffect, useState } from "react";

type Weather = { tempC: number; summary: string };

export default function WelcomeScene() {
  const [now, setNow] = useState(new Date());
  const [weather, setWeather] = useState<Weather | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;

    async function load() {
      const r = await fetch("/api/weather", { cache: "no-store" });
      if (!r.ok) return;
      const data = (await r.json()) as Weather;
      if (alive) weather || setWeather(data);
    }

    load();
    const t = setInterval(load, 10 * 60 * 1000); // 10 min
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [weather]);

  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);

  const date = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(now);

  return (
    <section className="h-full w-full flex flex-col justify-between p-14">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-6xl font-semibold tracking-tight">T.Group</div>
          <div className="mt-3 text-xl opacity-80">Recepção • Bem-vindos</div>
        </div>

        <div className="text-right">
          <div className="text-7xl font-semibold">{time}</div>
          <div className="mt-2 text-xl opacity-80 capitalize">{date}</div>
        </div>
      </div>

      <div className="flex items-end justify-between">
        <div className="max-w-3xl">
          <div className="text-4xl font-semibold leading-tight">
            Cultura em movimento.
            <span className="opacity-80"> Performance + Experiência.</span>
          </div>
          <div className="mt-5 text-lg opacity-70">
            Atualizações ao vivo • Sem spam • Só o que importa pra quem passa por aqui
          </div>
        </div>

        <div className="text-right">
          <div className="text-3xl font-semibold">
            {weather ? `${Math.round(weather.tempC)}°C` : "—"}
          </div>
          <div className="mt-1 text-lg opacity-70">
            {weather ? weather.summary : "Carregando clima…"}
          </div>
        </div>
      </div>
    </section>
  );
}
