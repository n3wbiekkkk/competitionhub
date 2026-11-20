import { NextResponse } from "next/server";
import { z } from "zod";
import {
  extractTechCompetitionFromText,
  extractTextFromPosterImage,
  fetchUrlMarkdown,
} from "@/lib/ai/extract-competition";
import { isTyphoonConfigured } from "@/lib/ai/opentyphoon";
import { validatePublicHttpUrl } from "@/lib/utils/url-safety";
import { requireAuthUser } from "@/lib/auth/cookies";

const jsonExtractSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("url"),
    url: z.string().trim().url("กรุณากรอกลิงก์ URL ให้ถูกต้อง"),
  }),
  z.object({
    mode: z.literal("text"),
    text: z
      .string()
      .trim()
      .min(20, "กรุณาวางข้อความรายละเอียดอย่างน้อย 20 ตัวอักษร")
      .max(25_000, "ข้อความยาวเกินไป"),
    sourceUrl: z.string().trim().optional().nullable().refine((value) => {
      if (!value) return true;
      try { validatePublicHttpUrl(value); return true; } catch { return false; }
    }, "ลิงก์ต้นทางต้องเป็น URL สาธารณะ http/https เท่านั้น"),
  }),
]);

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const MAX_POSTER_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const auth = await requireAuthUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!isTyphoonConfigured()) {
    return NextResponse.json(
      { error: "ยังไม่ได้ตั้งค่าบริการวิเคราะห์อัตโนมัติในระบบ" },
      { status: 500 },
    );
  }

  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const mode = formData.get("mode");
      const file = formData.get("file");

      if (mode !== "poster" || !(file instanceof File)) {
        return NextResponse.json(
          { error: "กรุณาอัปโหลดไฟล์ภาพโปสเตอร์การแข่งขัน" },
          { status: 400 },
        );
      }

      if (!ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase())) {
        return NextResponse.json(
          { error: "รองรับเฉพาะไฟล์ภาพ JPG, PNG หรือ WebP เท่านั้น" },
          { status: 400 },
        );
      }

      if (file.size > MAX_POSTER_BYTES) {
        return NextResponse.json(
          { error: "ไฟล์ภาพโปสเตอร์ต้องมีขนาดไม่เกิน 8 MB" },
          { status: 400 },
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const ocrText = await extractTextFromPosterImage(
        buffer,
        file.type,
        file.name || "poster.png",
      );
      const extracted = await extractTechCompetitionFromText(ocrText, null);

      return NextResponse.json({
        extracted,
        sourceType: "ai_poster" as const,
        sourceUrl: null,
        ocrTextPreview: ocrText.slice(0, 600),
      });
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        { error: "รูปแบบคำขอไม่ถูกต้อง" },
        { status: 400 },
      );
    }

    const parsed = jsonExtractSchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstIssue =
        parsed.error.issues[0]?.message ?? "ข้อมูลไม่ครบถ้วน";
      return NextResponse.json({ error: firstIssue }, { status: 400 });
    }

    if (parsed.data.mode === "url") {
      const fetched = await fetchUrlMarkdown(parsed.data.url);
      if (!fetched.ok) {
        return NextResponse.json(
          {
            error: fetched.messageTh,
            code:
              fetched.kind === "blocked_wall" ? "BLOCKED_WALL" : "FETCH_ERROR",
          },
          { status: 422 },
        );
      }

      const extracted = await extractTechCompetitionFromText(
        fetched.markdown,
        fetched.url,
      );

      return NextResponse.json({
        extracted,
        sourceType: "ai_link" as const,
        sourceUrl: fetched.url,
      });
    }

    const optionalUrl = parsed.data.sourceUrl?.trim() || null;
    const extracted = await extractTechCompetitionFromText(
      parsed.data.text,
      optionalUrl,
    );

    return NextResponse.json({
      extracted,
      sourceType: "ai_link" as const,
      sourceUrl: optionalUrl,
    });
  } catch (error) {
    console.error("[api/ai/extract] error:", error);
    return NextResponse.json(
      {
        error: "เกิดข้อผิดพลาดระหว่างวิเคราะห์ข้อมูลด้วย AI กรุณาลองใหม่อีกครั้ง",
      },
      { status: 500 },
    );
  }
}
