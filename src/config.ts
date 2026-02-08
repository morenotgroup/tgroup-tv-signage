export const SIGNAGE_CONFIG = {
  companyName: "T.Group",
  locationLabel: "Perdizes — São Paulo",
  // São Paulo (aprox.). Se quiser mudar, troca aqui.
  latitude: -23.5505,
  longitude: -46.6333,

  // Rotação das telas
  sceneDurationMs: 12000,

  // Atualização de dados
  refreshWeatherMs: 10 * 60 * 1000,
  refreshNewsMs: 20 * 60 * 1000,

  // News RSS (Google News BR)
  // O padrão do RSS é bem conhecido (hl/gl/ceid) :contentReference[oaicite:4]{index=4}
  newsRssUrl: "https://news.google.com/rss?hl=pt-BR&gl=BR&ceid=BR:pt-419"
};
