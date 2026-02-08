export type BirthdayPoster = {
  // "MM-DD"
  md: string;
  name: string;
  companyTag?: "T.Group" | "T.Youth" | "T.Brands" | "T.Dreams" | "T.Venues";
  posterSrc: string; // caminho em /public
};

export const BIRTHDAY_POSTERS: BirthdayPoster[] = [
  {
    md: "02-03",
    name: "Giulia",
    companyTag: "T.Group",
    posterSrc: "/birthdays/0302_BDAY_GIU_TG.png",
  },
  {
    md: "02-13",
    name: "Mateus",
    companyTag: "T.Group",
    posterSrc: "/birthdays/1302_BDAY_MATEUS_TG.png",
  },
  {
    md: "02-21",
    name: "Ana Lu",
    companyTag: "T.Brands",
    posterSrc: "/birthdays/2102_BDAY_ANALU_TB.png",
  },
];

export function toMMDD(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}-${dd}`;
}

export function postersForToday(now: Date) {
  const md = toMMDD(now);
  return BIRTHDAY_POSTERS.filter((p) => p.md === md);
}

export function postersForMonth(now: Date) {
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return BIRTHDAY_POSTERS.filter((p) => p.md.startsWith(`${mm}-`));
}
