// src/config.ts

export type BrandTab = {
  id: "T.Brands" | "T.Venues" | "T.Dreams" | "T.Youth";
  label: string;      // texto que aparece na pill
  logo: string;       // caminho em /public
};

export type BirthdayPoster = {
  mmdd: string;       // pode ser "mmdd" OU "ddmm" (seu SignagePremium aceita os dois)
  label?: string;
  src: string;        // caminho em /public
};

export type WelcomePoster = {
  mm: string;         // "02", "03", etc
  label?: string;
  src: string;        // caminho em /public
};

export type AudioConfig = {
  enabled: boolean;
  defaultProfile?: string; // deixa flexível pro seu MusicDock
};

export type SignageConfig = {
  companyName: string;
  locationLabel: string;

  // timing
  sceneDurationMs: number;
  refreshWeatherMs: number;
  refreshNewsMs: number;

  // weather source (open-meteo)
  latitude: number;
  longitude: number;

  // news source (rss)
  newsRssUrl: string;

  // ticker fallback
  defaultTicker: string;

  // branding
  logos?: {
    tgroup?: string;
  };

  brandTabs: BrandTab[];

  // assets
  birthdayPosters: BirthdayPoster[];
  welcomePosters: WelcomePoster[];

  // music
  audio?: AudioConfig;
};

export const SIGNAGE_CONFIG: SignageConfig = {
  companyName: "T.Group",
  locationLabel: "Sede • Perdizes",

  sceneDurationMs: 14000,
  refreshWeatherMs: 10 * 60 * 1000,
  refreshNewsMs: 20 * 60 * 1000,

  // ✅ Usei São Paulo como padrão seguro.
  // Se quiser “mais Perdizes”, troca aqui depois.
  latitude: -23.5505,
  longitude: -46.6333,

  // ✅ RSS padrão (pode trocar depois)
  newsRssUrl: "https://news.google.com/rss?hl=pt-BR&gl=BR&ceid=BR:pt-419",

  defaultTicker:
    "T.Group • Cultura, performance e execução • Foco no que importa • Respeito e diversidade • Bora fazer acontecer",

  logos: {
    // ajuste para o nome real do seu arquivo em /public/logos
    tgroup: "/logos/tgroup.png",
  },

  // ⚠️ IMPORTANTE: seu SignagePremium usa b.id e b.logo
  brandTabs: [
    { id: "T.Brands", label: "BRANDS", logo: "/logos/tbrands.png" },
    { id: "T.Venues", label: "VENUES", logo: "/logos/tvenues.png" },
    { id: "T.Dreams", label: "DREAMS", logo: "/logos/tdreams.png" },
    { id: "T.Youth", label: "YOUTH", logo: "/logos/tyouth.png" },
  ],

  // ✅ Aniversariantes (subir em /public/signage/birthdays)
  // Você pode usar "0302" (ddmm) igual o nome do arquivo — seu componente aceita!
  birthdayPosters: [
    { mmdd: "0302", label: "Giulia • T.Group", src: "/signage/birthdays/0302_BDAY_GIU_TG.png" },
    { mmdd: "0402", label: "Milena • T.Brands", src: "/signage/birthdays/0402_BDAY_MILENA_TB.png" },
    { mmdd: "1302", label: "Mateus • T.Group", src: "/signage/birthdays/1302_BDAY_MATEUS_TG.png" },
    { mmdd: "2102", label: "Analu • T.Brands", src: "/signage/birthdays/2102_BDAY_ANALU_TB.png" },
    { mmdd: "2702", label: "Somma • T.Youth", src: "/signage/birthdays/2702_BDAY_SOMMA_TY.png" },
  ],

  // ✅ Chegadas do mês (subir em /public/signage/welcome)
  // Fevereiro = "02"
  welcomePosters: [
    { mm: "02", label: "Gabriella • T.Dreams", src: "/signage/welcome/welcomer_gabriella_tdreams.png" },
    // ✅ RECOMENDADO: renomear o arquivo COM ACENTO para isso:
    { mm: "02", label: "Pérola • T.Dreams", src: "/signage/welcome/welcomer_perola_tdreams.png" },
    { mm: "02", label: "Amanda • Casa Maria", src: "/signage/welcome/welcomer_amanda_casamaria.png" },
  ],

  // ✅ evita o erro do MusicDock e mantém o player habilitado
  audio: {
    enabled: true,
    defaultProfile: "agency",
  },
};
