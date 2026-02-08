const SAMPLE = [
  { name: "Exemplo Pessoa 1", date: "05/02" },
  { name: "Exemplo Pessoa 2", date: "18/02" },
  { name: "Exemplo Pessoa 3", date: "27/02" },
];

export default function BirthdaysScene() {
  return (
    <section className="h-full w-full p-14 flex flex-col">
      <div className="text-5xl font-semibold">Aniversariantes</div>
      <div className="mt-3 text-xl opacity-70">Fevereiro • próximos dias</div>

      <div className="mt-10 grid grid-cols-2 gap-6">
        {SAMPLE.map((p) => (
          <div
            key={p.name}
            className="rounded-3xl border border-white/10 bg-white/5 p-8"
          >
            <div className="text-2xl font-semibold">{p.name}</div>
            <div className="mt-2 text-lg opacity-70">{p.date}</div>
          </div>
        ))}
      </div>

      <div className="mt-auto text-lg opacity-60">
        (na próxima etapa a gente puxa isso de uma planilha/JSON sem você mexer no código)
      </div>
    </section>
  );
}
