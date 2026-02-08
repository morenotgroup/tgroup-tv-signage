import { NextResponse } from "next/server";
import { BIRTHDAYS } from "@/data/birthdays";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    { ok: true, birthdays: BIRTHDAYS },
    { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=7200" } }
  );
}
