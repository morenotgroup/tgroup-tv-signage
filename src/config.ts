export const SIGNAGE_CONFIG = {
  companyName: "T.Group",
  groupLogoSrc: "/logos/tgroup.png",
  locationLabel: "Perdizes — São Paulo",

  // São Paulo (aprox.)
  latitude: -23.5505,
  longitude: -46.6333,

  // Rotação das cenas
  sceneDurationMs: 14000,

  // Atualização de dados
  refreshWeatherMs: 10 * 60 * 1000,
  refreshNewsMs: 20 * 60 * 1000,

  // RSS/News
  newsRssUrl: "https://news.google.com/rss?hl=pt-BR&gl=BR&ceid=BR:pt-419",

  // Logos (coloca em /public/logos/*; se não tiver, deixa vazio que ele cai no texto)
  logos: {
    tgroup: "/logos/tgroup.png",
    youth: "/logos/tyouth.png",
    dreams: "/logos/tdreams.png",
    brands: "/logos/tbrands.png",
    venues: "/logos/tvenues.png",
  },

  brandTabs: [
    { id: "youth", label: "YOUTH", logo: "/logos/tyouth.png" },
    { id: "dreams", label: "DREAMS", logo: "/logos/tdreams.png" },
    { id: "brands", label: "BRANDS", logo: "/logos/tbrands.png" },
    { id: "venues", label: "VENUES", logo: "/logos/tvenues.png" },
  ],

  // Posters de aniversariantes (recomendo em /public/birthdays/*)
  // mmdd: "0302" = 03/02
  birthdayPosters: [
    { mmdd: "0302", src: "/birthdays/0302_BDAY_GIU_TG.png", label: "Giulia" },
    { mmdd: "1302", src: "/birthdays/1302_BDAY_MATEUS_TG.png", label: "Mateus" },
    { mmdd: "2102", src: "/birthdays/2102_BDAY_ANALU_TB.png", label: "Analu" },
  ],

  // “Fallback bonito” quando ainda não tem manchetes
  defaultTicker:
    "T.Group • Boas-vindas • Segurança em primeiro lugar • Bom trabalho e boa semana! •",

  // Música
  audio: {
    enabled: true,
    defaultProfile: "agency" as const, // "agency" | "focus" | "chill"
    volume: 0.35,
  },
} as const;
