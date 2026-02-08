// src/lib/radio.ts
export const RADIO_PROFILE_IDS = ["agency", "focus", "chill"] as const;
export type RadioProfileId = (typeof RADIO_PROFILE_IDS)[number];

export function toRadioProfileId(v: unknown): RadioProfileId {
  if (typeof v === "string" && (RADIO_PROFILE_IDS as readonly string[]).includes(v)) {
    return v as RadioProfileId;
  }
  return "agency";
}
