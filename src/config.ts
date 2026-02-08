// app/config.ts (ou src/config.ts — onde estiver o seu ../config)

export type BrandTab = { id: string; label: string; logo?: string };

export type BirthdayPoster = {
  /**
   * Aceita mmdd ("0203" = 03/02) OU ddmm ("0302" = 03/02).
   * O signage vai tentar casar com os dois formatos (robusto).
   */
  mmdd: string;
  label?: string;
  src: string; // path a partir do /public (ex: "/signage/birthdays/0302_BDAY_GIU_TG.png")
};

export type WelcomePoster = {
  mm: string; // "02" para fevereiro, "03" para março...
  label?: string;
  src: string; // "/signage/welcome/..."
};

export const SIGNAGE_CONFIG = {
  companyName: "T.Group",
  locationLabel: "Sede • Perdizes",
  sceneDurationMs: 14000,

  refreshWeatherMs: 10 * 60 * 1000,
  refreshNewsMs: 20 * 60 * 1000,

  defaultTicker:
    "T.Group • Painel ao vivo • Cultura, performance e tecnologia • Confira as atualizações do mês •",

  logos: {
    tgroup: "/logos/tgroup.png", // ajuste se já tiver outro caminho
  },

  brandTabs: [
    { id: "youth", label: "YOUTH", logo: "/logos/tyouth.png" },
    { id: "dreams", label: "DREAMS", logo: "/logos/tdreams.png" },
    { id: "brands", label: "BRANDS", logo: "/logos/tbrands.png" },
    { id: "venues", label: "VENUES", logo: "/logos/tvenues.png" },
  ] satisfies BrandTab[],

  birthdayPosters: [
    // >>> Fevereiro (arquivos que você anexou)
    { mmdd: "0221", label: "Analu • T.Brands", src: "/signage/birthdays/2102_BDAY_ANALU_TB.png" },
    { mmdd: "0213", label: "Mateus • T.Group", src: "/signage/birthdays/1302_BDAY_MATEUS_TG.png" },
    { mmdd: "0203", label: "Giu • T.Group", src: "/signage/birthdays/0302_BDAY_GIU_TG.png" },
    { mmdd: "0204", label: "Milena • T.Brands", src: "/signage/birthdays/0402_BDAY_MILENA_TB.png" },
    { mmdd: "0227", label: "Somma • T.Youth", src: "/signage/birthdays/2702_BDAY_SOMMA_TY.png" },

    /**
     * Se em algum momento você já tinha config no formato ddmm (ex: "0302"),
     * tá tudo bem: o signage agora aceita os dois formatos.
     * Exemplo (se quiser manter ddmm):
     * { mmdd: "0302", label: "Giu", src: "/signage/birthdays/0302_BDAY_GIU_TG.png" },
     */
  ] satisfies BirthdayPoster[],

  welcomePosters: [
    // >>> Chegadas de fevereiro (as 3 artes)
    { mm: "02", label: "Amanda • Casa Maria", src: "/signage/welcome/welcomer_amanda_casamaria.png" },
    { mm: "02", label: "Gabriella • T.Dreams", src: "/signage/welcome/welcomer_gabriella_tdreams.png" },
    { mm: "02", label: "Pérola • T.Dreams", src: "/signage/welcome/welcomer_perola_tdreams.png" },
  ] satisfies WelcomePoster[],
} as const;
