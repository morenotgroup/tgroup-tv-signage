export const SIGNAGE_CONFIG = {
  companyName: "T.Group",
  locationLabel: "Perdizes — São Paulo",

  // São Paulo (aprox.). Se quiser mudar, troca aqui.
  latitude: -23.5505,
  longitude: -46.6333,

  // Rotação das telas
  sceneDurationMs: 14000,

  // Atualização de dados
  refreshWeatherMs: 10 * 60 * 1000,
  refreshNewsMs: 20 * 60 * 1000,

  // Logo do grupo (ajuste quando tiver o arquivo no /public/logos)
  groupLogoSrc: "/logos/tgroup.png",

  // Logos das empresas (ajuste quando tiver os arquivos no /public/logos)
  brandTabs: [
    { key: "T.Brands", label: "BRANDS", logoSrc: "/logos/tbrands.png" },
    { key: "T.Venues", label: "VENUES", logoSrc: "/logos/tvenues.png" },
    { key: "T.Dreams", label: "DREAMS", logoSrc: "/logos/tdreams.png" },
    { key: "T.Youth", label: "YOUTH", logoSrc: "/logos/tyouth.png" },
  ],

  // Posters de aniversariantes (coloque os PNGs em /public/birthdays)
  birthdayPosters: [
    { mmdd: "0302", src: "/birthdays/0302_BDAY_GIU_TG.png", label: "Giu" },
    { mmdd: "1302", src: "/birthdays/1302_BDAY_MATEUS_TG.png", label: "Mateus" },
    { mmdd: "2102", src: "/birthdays/2102_BDAY_ANALU_TB.png", label: "Analu" },
  ],

  // News RSS (Google News BR)
  // Formato padrão do RSS do Google News com parâmetros hl/gl/ceid.
  newsRssUrl: "https://news.google.com/rss?hl=pt-BR&gl=BR&ceid=BR:pt-419",

  // Música (MusicDock lê isso)
  audio: {
    enabled: true,
    defaultProfile: "agency",
    volume: 0.35,
  },
} as const;
