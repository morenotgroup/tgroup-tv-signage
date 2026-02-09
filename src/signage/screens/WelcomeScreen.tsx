"use client";

import React from "react";
import { Montserrat } from "next/font/google";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

type WelcomeScreenProps = {
  city?: string; // ex: "Perdizes"
  state?: string; // ex: "São Paulo"
  tempC?: number; // ex: 23
};

function clamp(pxMin: number, vw: number, pxMax: number) {
  // helper só pra manter consistência mental no design (não usado no runtime)
  return `clamp(${pxMin}px, ${vw}vw, ${pxMax}px)`;
}

export default function WelcomeScreen(props: WelcomeScreenProps) {
  const city = props.city ?? "Perdizes";
  const state = props.state ?? "São Paulo";

  const tempText = Number.isFinite(props.tempC as number)
    ? `${Math.round(props.tempC as number)}°C`
    : "—°C";

  // Textos: mantidos (só layout/visual muda)
  const mission =
    "Criar experiências memoráveis em entretenimento, eventos e live marketing, com excelência na execução.";

  const vision =
    "Ser referência em entretenimento e live marketing com performance e tecnologia.";

  const values = [
    "Respeito, diversidade e segurança",
    "Excelência com leveza",
    "Dono(a) do resultado",
    "Criatividade que vira entrega",
    "Transparência e colaboração",
  ];

  return (
    <section className={`${montserrat.className} relative h-full w-full`}>
      {/* Orbs/Glow mais vibrante (TV-friendly) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* topo esquerda */}
        <div className="absolute -left-24 -top-24 h-[520px] w-[520px] rounded-full bg-fuchsia-500/25 blur-[90px]" />
        {/* topo direita */}
        <div className="absolute right-[-180px] top-[-140px] h-[620px] w-[620px] rounded-full bg-cyan-400/18 blur-[95px]" />
        {/* base centro */}
        <div className="absolute left-[20%] bottom-[-220px] h-[700px] w-[700px] rounded-full bg-violet-500/18 blur-[105px]" />
        {/* base direita */}
        <div className="absolute right-[-120px] bottom-[-180px] h-[520px] w-[520px] rounded-full bg-lime-400/12 blur-[95px]" />

        {/* vinheta leve pra não “lavar” o texto */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/25 to-black/35" />
      </div>

      {/* Conteúdo */}
      <div className="relative flex h-full w-full flex-col px-10 py-10 md:px-12 md:py-12">
        {/* HEADER */}
        <div className="flex flex-col gap-3">
          <h1 className="leading-[0.95] tracking-tight text-white font-black text-[clamp(44px,4.8vw,92px)]">
            Bem-vindas, vindes e vindos ao{" "}
            <span className="text-white/95">T.Group</span>
          </h1>

          <div className="flex flex-wrap items-center gap-3 text-white/75 font-semibold text-[clamp(16px,1.25vw,22px)]">
            <span>Sede • {city} - {state}</span>
            <span className="text-white/35">•</span>
            <span>Clima agora: {tempText}</span>

            <span className="ml-0 md:ml-auto inline-flex items-center rounded-full border border-white/12 bg-white/6 px-4 py-2 text-white/70 font-bold text-[clamp(12px,1vw,16px)]">
              entretenimento • live marketing • performance • tecnologia
            </span>
          </div>
        </div>

        {/* MAIN: ocupa a tela de verdade */}
        <div className="mt-8 grid flex-1 grid-cols-1 gap-8 lg:grid-cols-3">
          {/* MISSÃO */}
          <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-white/6 p-8 lg:p-10">
            {/* barra/acento */}
            <div className="absolute inset-x-0 top-0 h-[7px] bg-gradient-to-r from-fuchsia-400 via-rose-400 to-orange-300 opacity-90" />
            {/* brilho interno */}
            <div className="pointer-events-none absolute -left-24 -top-24 h-[320px] w-[320px] rounded-full bg-fuchsia-400/14 blur-[70px]" />

            <div className="flex items-center gap-3">
              <IconSpark />
              <span className="uppercase tracking-[0.18em] text-white/70 font-extrabold text-[clamp(12px,0.9vw,14px)]">
                Missão
              </span>
            </div>

            <p className="mt-5 text-white font-extrabold leading-[1.05] text-[clamp(26px,2.15vw,44px)]">
              {mission}
            </p>

            <div className="mt-6 text-white/65 font-semibold text-[clamp(14px,1.05vw,18px)]">
              Experiência + execução impecável. Do briefing ao aplauso.
            </div>
          </div>

          {/* VISÃO */}
          <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-white/6 p-8 lg:p-10">
            <div className="absolute inset-x-0 top-0 h-[7px] bg-gradient-to-r from-cyan-300 via-sky-400 to-indigo-400 opacity-90" />
            <div className="pointer-events-none absolute -right-28 -top-28 h-[340px] w-[340px] rounded-full bg-cyan-300/14 blur-[75px]" />

            <div className="flex items-center gap-3">
              <IconEye />
              <span className="uppercase tracking-[0.18em] text-white/70 font-extrabold text-[clamp(12px,0.9vw,14px)]">
                Visão
              </span>
            </div>

            <p className="mt-5 text-white font-extrabold leading-[1.05] text-[clamp(26px,2.15vw,44px)]">
              {vision}
            </p>

            <div className="mt-6 text-white/65 font-semibold text-[clamp(14px,1.05vw,18px)]">
              Crescer com performance real, dados e tecnologia — sem perder o
              brilho do entretenimento.
            </div>
          </div>

          {/* VALORES */}
          <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-white/6 p-8 lg:p-10">
            <div className="absolute inset-x-0 top-0 h-[7px] bg-gradient-to-r from-lime-300 via-emerald-400 to-violet-400 opacity-90" />
            <div className="pointer-events-none absolute left-[-140px] bottom-[-140px] h-[380px] w-[380px] rounded-full bg-emerald-400/12 blur-[85px]" />

            <div className="flex items-center gap-3">
              <IconCheck />
              <span className="uppercase tracking-[0.18em] text-white/70 font-extrabold text-[clamp(12px,0.9vw,14px)]">
                Valores
              </span>
            </div>

            <ul className="mt-6 space-y-4">
              {values.map((v) => (
                <li key={v} className="flex items-start gap-3">
                  <span className="mt-[3px] inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/14 bg-white/8">
                    <IconMiniCheck />
                  </span>
                  <span className="text-white font-extrabold leading-[1.15] text-[clamp(20px,1.55vw,30px)]">
                    {v}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-6 text-white/60 font-semibold text-[clamp(14px,1.05vw,18px)]">
              Aqui a cultura não é discurso — é jeito de operar.
            </div>
          </div>
        </div>

        {/* Footer micro-copy (bem discreto) */}
        <div className="mt-8 flex items-center justify-between text-white/55 font-semibold text-[clamp(12px,0.95vw,16px)]">
          <span>Sinta-se em casa. A gente cuida do resto.</span>
          <span className="hidden md:inline">Recepção • TV Signage</span>
        </div>
      </div>
    </section>
  );
}

/* ===== Icons (inline pra não depender de libs) ===== */

function IconSpark() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      className="text-white/80"
      aria-hidden="true"
    >
      <path
        d="M12 2l1.1 5.1L18 8l-4.9 1L12 14l-1.1-5.1L6 8l4.9-.9L12 2z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M19 12l.6 2.6L22 15l-2.4.5L19 18l-.6-2.5L16 15l2.4-.4L19 12z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconEye() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      className="text-white/80"
      aria-hidden="true"
    >
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      className="text-white/80"
      aria-hidden="true"
    >
      <path
        d="M20 6L9 17l-5-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconMiniCheck() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      className="text-white/80"
      aria-hidden="true"
    >
      <path
        d="M20 6L9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}