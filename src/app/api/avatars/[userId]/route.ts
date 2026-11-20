import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthUser } from "@/lib/auth/cookies";
import { withUserDb } from "@/lib/db/pool";

export const dynamic = "force-dynamic";

const uuidSchema = z.string().uuid();

export async function GET(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { userId } = await context.params;
  if (!uuidSchema.safeParse(userId).success || userId !== auth.user.id) {
    return NextResponse.json({ error: "ไม่พบภาพโปรไฟล์" }, { status: 404 });
  }

  const avatar = await withUserDb(auth.user.id, async (client) => {
    const result = await client.query<{ data: Buffer; mime_type: string }>(
      "SELECT data, mime_type FROM public.profile_avatars WHERE user_id = $1 LIMIT 1",
      [userId],
    );
    return result.rows[0] ?? null;
  });

  if (!avatar) {
    return NextResponse.json({ error: "ไม่พบภาพโปรไฟล์" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(avatar.data), {
    headers: {
      "Content-Type": avatar.mime_type,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
