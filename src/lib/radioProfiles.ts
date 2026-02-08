export type RadioProfileId = "agency" | "focus" | "chill";

export type RadioProfile = {
  id: RadioProfileId;
  label: string;
  // Tentamos tags em sequência até conseguir uma lista boa
  tags: string[];
  // Fallback de país ("" = sem filtro)
  countryPriority: Array<"" | string>;
  // Qualidade mínima
  bitrateMin: number;
  // Tentamos codecs em sequência
  codecs: string[];
  // Quantas estações retornar por tentativa
  perTryLimit: number;
};

export const RADIO_PROFILES: Record<RadioProfileId, RadioProfile> = {
  agency: {
    id: "agency",
    label: "Agência (Pop / Dance / House)",
    tags: ["dance", "electronic", "house", "pop", "hits", "top40", "edm"],
    // BR primeiro, depois global
    countryPriority: ["BR", ""],
    bitrateMin: 96,
    codecs: ["MP3", "AAC"],
    perTryLimit: 60,
  },
  focus: {
    id: "focus",
    label: "Focus (Lo-fi / Ambient)",
    tags: ["lofi", "ambient", "chillout", "downtempo", "study"],
    countryPriority: ["", "BR"],
    bitrateMin: 96,
    codecs: ["MP3", "AAC"],
    perTryLimit: 60,
  },
  chill: {
    id: "chill",
    label: "Chill (Lounge / Deep / Chillout)",
    tags: ["chillout", "lounge", "downtempo", "deep house", "smooth"],
    countryPriority: ["", "BR"],
    bitrateMin: 96,
    codecs: ["MP3", "AAC"],
    perTryLimit: 60,
  },
};
