import { NextResponse } from "next/server";
import { checkDatabaseHealth } from "@/lib/db/pool";

export const dynamic = "force-dynamic";

export async function GET() {
  const database = await checkDatabaseHealth();
  const payload = {
    status: database.ok ? "ok" : "unavailable",
    database: database.ok ? "ok" : "unavailable",
  };
  return NextResponse.json(payload, {
    status: database.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
