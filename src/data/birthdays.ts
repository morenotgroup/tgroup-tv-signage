export type Birthday = {
  name: string;
  month: number; // 1-12
  day: number;   // 1-31
  team?: string;
};

export const BIRTHDAYS: Birthday[] = [
  { name: "Ana", month: 2, day: 9, team: "T.Youth" },
  { name: "Bruno", month: 2, day: 18, team: "T.Venues" },
  { name: "Camila", month: 2, day: 28, team: "T.Brands" },
  { name: "Diego", month: 3, day: 3, team: "T.Dreams" }
];
