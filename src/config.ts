export const SIGNAGE_CONFIG = {
  companyName: "T.Group",
  locationLabel: "Perdizes — São Paulo",

  // São Paulo (aprox.). Se quiser mudar, troca aqui.
  latitude: -23.5505,
  longitude: -46.6333,

  // Rotação das cenas (quanto menor, mais “dinâmico”)
  sceneDurationMs: 12_000,

  // Atualização de dados
  refreshWeatherMs: 10 * 60 * 1000,
  refreshNewsMs: 20 * 60 * 1000,

  // News RSS (Google News BR)
  // Formato padrão do RSS do Google News com parâmetros hl/gl/ceid.
  newsRssUrl: "https://news.google.com/rss?hl=pt-BR&gl=BR&ceid=BR:pt-419",

  // Tabs/logos do topo (assets entram no PR separado depois)
  brandTabs: [
    { id: "youth", label: "YOUTH", logoSrc: "/logos/t.youth.svg" },
    { id: "dreams", label: "DREAMS", logoSrc: "/logos/t.dreams.svg" },
    { id: "brands", label: "BRANDS", logoSrc: "/logos/t.brands.svg" },
    { id: "venues", label: "VENUES", logoSrc: "/logos/t.venues.svg" },
  ],

  // Logo principal
  groupLogoSrc: "/logos/t.group.svg",

  // Música
  audio: {
    defaultProfile: "agency" as const,
    defaultVolume: 0.35,
    autoplayMuted: true,
    stationsLimit: 80,
  },
} as const;
