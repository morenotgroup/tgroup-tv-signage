const BRANDS = ["T.Brands", "T.Dreams", "T.Venues", "T.Youth"];

export default function BrandScene() {
  return (
    <section className="h-full w-full p-14 flex flex-col justify-center">
      <div className="text-6xl font-semibold text-center">T.Group</div>
      <div className="mt-6 text-xl opacity-70 text-center">
        Holding de entretenimento • energia alta • entrega grande
      </div>

      <div className="mt-14 grid grid-cols-2 gap-8 max-w-4xl mx-auto w-full">
        {BRANDS.map((b) => (
          <div
            key={b}
            className="rounded-3xl border border-white/10 bg-white/5 p-10 text-3xl font-semibold text-center"
          >
            {b}
          </div>
        ))}
      </div>
    </section>
  );
}
