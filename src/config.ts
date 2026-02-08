export const SIGNAGE_CONFIG = {
  companyName: "T.Group",
  // 👇 NOVO: usado pelo SignageV2
  groupLogoSrc: "/logos/tgroup.png",

  locationLabel: "Perdizes — São Paulo",
  latitude: -23.5505,
  longitude: -46.6333,

  // Rotação das telas
  sceneDurationMs: 14000,

  // Atualização de dados
  refreshWeatherMs: 10 * 60 * 1000,
  refreshNewsMs: 20 * 60 * 1000,

  // News RSS (Google News BR)
  newsRssUrl: "https://news.google.com/rss?hl=pt-BR&gl=BR&ceid=BR:pt-419",

  // Tabs das empresas (se seu SignageV2 já usa isso, mantém; se não usa, não atrapalha)
  brandTabs: [
    { key: "T.Youth", label: "YOUTH", logoSrc: "/logos/tyouth.png" },
    { key: "T.Dreams", label: "DREAMS", logoSrc: "/logos/tdreams.png" },
    { key: "T.Brands", label: "BRANDS", logoSrc: "/logos/tbrands.png" },
    { key: "T.Venues", label: "VENUES", logoSrc: "/logos/tvenues.png" },
  ],

  // Áudio / MusicDock
  audio: {
    enabled: true,
    defaultProfile: "agency",
    volume: 0.35,
  },
} as const;
