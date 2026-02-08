import "./globals.css";

export const metadata = {
  title: "T.Group — TV Signage",
  description: "Eletromídia interna (clima, notícias, aniversariantes, avisos)."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
