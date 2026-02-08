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

  // ✅ Compat: alguns componentes esperam SIGNAGE_CONFIG.logos?.tgroup etc.
  // Coloque os arquivos em /public/logos (tgroup.png, tbrands.png, tvenues.png, tdreams.png, tyouth.png)
  logos: {
    tgroup: "/logos/tgroup.png",
    tbrands: "/logos/tbrands.png",
    tvenues: "/logos/tvenues.png",
    tdreams: "/logos/tdreams.png",
    tyouth: "/logos/tyouth.png",
  },

  // ✅ V2/V3 também podem usar esses campos
  groupLogoSrc: "/logos/tgroup.png",
    brandTabs: [
    {
      id: "T.Brands",
      key: "T.Brands",
      label: "BRANDS",
      logo: "/logos/tbrands.png",
      logoSrc: "/logos/tbrands.png",
    },
    {
      id: "T.Venues",
      key: "T.Venues",
      label: "VENUES",
      logo: "/logos/tvenues.png",
      logoSrc: "/logos/tvenues.png",
    },
    {
      id: "T.Dreams",
      key: "T.Dreams",
      label: "DREAMS",
      logo: "/logos/tdreams.png",
      logoSrc: "/logos/tdreams.png",
    },
    {
      id: "T.Youth",
      key: "T.Youth",
      label: "YOUTH",
      logo: "/logos/tyouth.png",
      logoSrc: "/logos/tyouth.png",
    },
  ],

  // Posters de aniversariantes (PNG em /public/birthdays)
  birthdayPosters: [
    { mmdd: "0302", src: "/birthdays/0302_BDAY_GIU_TG.png", label: "Giu" },
    { mmdd: "1302", src: "/birthdays/1302_BDAY_MATEUS_TG.png", label: "Mateus" },
    { mmdd: "2102", src: "/birthdays/2102_BDAY_ANALU_TB.png", label: "Analu" },
  ],

  // Texto do ticker quando ainda não carregou notícias
  defaultTicker: "Bem-vindos ao T.Group • Segurança e respeito sempre • Bom trabalho, time •",

  // News RSS (Google News BR)
  newsRssUrl: "https://news.google.com/rss?hl=pt-BR&gl=BR&ceid=BR:pt-419",

  // Música (MusicDock lê isso)
  audio: {
    enabled: true,
    defaultProfile: "agency",
    volume: 0.35,
  },
} as const;
