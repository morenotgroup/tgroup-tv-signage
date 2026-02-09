import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";

export const runtime = "nodejs";

/**
 * Lê automaticamente: /public/signage/birthdays
 * Espera nome do arquivo começando com 4 dígitos:
 *  - padrão recomendado: DDMM_BDAY_NOME_SIGLA.png (ex: 0302_BDAY_GIU_TG.png)
 * Também tolera MMDD_... caso alguém suba invertido.
 */
function parseDateFromFilename(filename: string) {
  const m = filename.match(/^(\d{2})(\d{2})_/);
  if (!m) return null;

  const a = Number(m[1]); // DD ou MM
  const b = Number(m[2]); // MM ou DD

  const isDDMM = a >= 1 && a <= 31 && b >= 1 && b <= 12;
  const isMMDD = a >= 1 && a <= 12 && b >= 1 && b <= 31;

  let day: number | undefined;
  let month: number | undefined;

  if (isDDMM) {
    day = a;
    month = b;
  } else if (isMMDD) {
    day = b;
    month = a;
  } else {
    return null;
  }

  const mmdd = `${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
  return { day, month, mmdd };
}

// Mapeamento opcional (pra ficar do jeitinho que você quer na lista)
// Você pode ir ampliando com o tempo sem mudar a lógica.
const META_BY_CODE: Record<
  string,
  { name: string; role: string; org: string }
> = {
  GIU_TG: { name: "Giulia Costa", role: "Facilities", org: "T.Group" },
  MILENA_TB: { name: "Milena Miranda", role: "Mídias", org: "T.Brands" },
  MATEUS_TG: { name: "Mateus dos Santos", role: "Facilities", org: "T.Group" },
  ANALU_TB: { name: "Ana Luiza", role: "Arquiteta", org: "T.Brands" },
  SOMMA_TY: { name: "Rafael Somma", role: "Comercial", org: "T.Youth" },
};

function parseMetaCode(filename: string) {
  // exemplo: 0302_BDAY_GIU_TG.png -> "GIU_TG"
  const base = filename.replace(/\.(png|jpg|jpeg|webp)$/i, "");
  const parts = base.split("_");
  const bdayIdx = parts.findIndex((p) => p.toUpperCase() === "BDAY");
  if (bdayIdx < 0) return undefined;

  const after = parts.slice(bdayIdx + 1); // ["GIU","TG"]
  if (after.length >= 2) {
    return `${after[0].toUpperCase()}_${after[1].toUpperCase()}`;
  }
  return undefined;
}

export async function GET() {
  try {
    const dir = path.join(process.cwd(), "public", "signage", "birthdays");
    let files: string[] = [];
    try {
      files = await fs.readdir(dir);
    } catch {
      // pasta não existe
      return NextResponse.json({ ok: true, items: [] });
    }

    const items = files
      .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))
      .map((filename) => {
        const date = parseDateFromFilename(filename);
        if (!date) return null;

        const code = parseMetaCode(filename);
        const meta = code ? META_BY_CODE[code] : undefined;

        return {
          filename,
          src: `/signage/birthdays/${filename}`,
          day: date.day,
          month: date.month,
          mmdd: date.mmdd,
          name: meta?.name,
          role: meta?.role,
          org: meta?.org,
        };
      })
      .filter(Boolean);

    return NextResponse.json(
      { ok: true, items },
      { headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=1200" } }
    );
  } catch {
    return NextResponse.json({ ok: false, items: [] }, { status: 200 });
  }
}