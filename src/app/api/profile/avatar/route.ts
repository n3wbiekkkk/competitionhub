import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireAuthUser } from "@/lib/auth/cookies";
import { withUserDb } from "@/lib/db/pool";
import { hasAllowedImageSignature } from "@/lib/utils/image-bytes";
import { logError } from "@/lib/utils/logger";

const MAX_RAW_BODY = 2 * 1024 * 1024;
const MAX_INPUT_BYTES = 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_RAW_BODY) {
    return NextResponse.json(
      { error: "ภาพมีขนาดใหญ่เกินไป กรุณาเลือกไฟล์ที่เล็กกว่า" },
      { status: 413 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "รูปแบบไฟล์ไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "กรุณาเลือกไฟล์รูปภาพ" },
      { status: 400 },
    );
  }
  if (!ALLOWED_MIME.has(file.type) || file.size > MAX_INPUT_BYTES) {
    return NextResponse.json(
      { error: "รองรับเฉพาะภาพ JPG, PNG หรือ WebP ขนาดไม่เกิน 1 MB" },
      { status: 400 },
    );
  }

  try {
    const source = Buffer.from(await file.arrayBuffer());
    if (!hasAllowedImageSignature(source, file.type)) {
      return NextResponse.json(
        { error: "ไฟล์ไม่ใช่ภาพ JPG, PNG หรือ WebP ที่ถูกต้อง" },
        { status: 400 },
      );
    }
    const image = sharp(source, { limitInputPixels: 1_000_000 });
    const metadata = await image.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width > 1024 ||
      metadata.height > 1024 ||
      metadata.width * metadata.height > 1_000_000
    ) {
      return NextResponse.json(
        { error: "ขนาดภาพเกินกำหนด กรุณาเลือกภาพที่เล็กกว่า" },
        { status: 400 },
      );
    }

    const output = await image
      .rotate()
      .resize(256, 256, { fit: "cover", position: "attention" })
      .webp({ quality: 80 })
      .toBuffer();

    if (output.length > 200 * 1024) {
      return NextResponse.json(
        { error: "ไม่สามารถบันทึกภาพนี้ได้ กรุณาลองภาพอื่น" },
        { status: 400 },
      );
    }

    const avatarUrl = `/api/avatars/${auth.user.id}?v=${Date.now()}`;
    await withUserDb(auth.user.id, async (client) => {
      await client.query(
        `INSERT INTO public.profile_avatars (user_id, data, mime_type, updated_at)
         VALUES ($1, $2, 'image/webp', now())
         ON CONFLICT (user_id) DO UPDATE
         SET data = EXCLUDED.data,
             mime_type = EXCLUDED.mime_type,
             updated_at = now()`,
        [auth.user.id, output],
      );
      await client.query(
        "UPDATE public.profiles SET avatar_url = $1 WHERE id = $2",
        [avatarUrl, auth.user.id],
      );
    });

    return NextResponse.json({ avatarUrl });
  } catch (error) {
    logError("[api/profile/avatar] upload failed", error);
    return NextResponse.json(
      { error: "ไม่สามารถอ่านภาพนี้ได้ กรุณาลองไฟล์อื่น" },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  await withUserDb(auth.user.id, async (client) => {
    await client.query("DELETE FROM public.profile_avatars WHERE user_id = $1", [auth.user.id]);
    await client.query("UPDATE public.profiles SET avatar_url = NULL WHERE id = $1", [auth.user.id]);
  });
  return NextResponse.json({ ok: true });
}
