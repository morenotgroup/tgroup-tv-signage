export type Birthday = {
  date: string; // MM-DD
  name: string;
  company: "T.Youth" | "T.Dreams" | "T.Brands" | "T.Venues";
  posterPath?: string;
};

export const BIRTHDAYS: Birthday[] = [
  { date: "02-09", name: "Ana Costa", company: "T.Youth", posterPath: "/brands/posters/ana-costa.jpg" },
  { date: "02-18", name: "Bruno Lima", company: "T.Venues", posterPath: "/brands/posters/bruno-lima.jpg" },
  { date: "02-28", name: "Camila Alves", company: "T.Brands", posterPath: "/brands/posters/camila-alves.jpg" },
  { date: "03-03", name: "Diego Santos", company: "T.Dreams", posterPath: "/brands/posters/diego-santos.jpg" },
  { date: "03-10", name: "Fernanda Rocha", company: "T.Youth" },
  { date: "03-16", name: "Gabriel Nunes", company: "T.Brands" },
];
