import { z } from "zod";
import { createTyphoonClient, getTyphoonConfig } from "@/lib/ai/opentyphoon";
import {
  TECH_CATEGORIES,
  TECH_ROLES,
  isTechCategory,
  isTechRole,
  type TechCategory,
} from "@/lib/constants/tech-taxonomy";
import {
  THAI_MONTHS_FULL,
  THAI_MONTHS_SHORT,
  getCurrentThaiDateContext,
  normalizeToIsoCeDate,
} from "@/lib/utils/thai-date";
import { validatePublicHttpUrl } from "@/lib/utils/url-safety";

export interface ExtractedCompetition {
  is_tech_related: boolean;
  rejection_reason: string | null;
  title: string;
  category: TechCategory;
  deadline: string | null;
  min_size: number;
  max_size: number;
  recommended_roles: string[];
  tech_stack_hints: string[];
  eligibility: string | null;
  summary: string;
}

const rawAiExtractionSchema = z.object({
  is_tech_related: z.boolean().nullish().default(false),
  rejection_reason: z.string().nullish(),
  title: z.string().nullish(),
  category: z.string().nullish(),
  deadline: z.string().nullish(),
  min_size: z.coerce.number().finite().nullish(),
  max_size: z.coerce.number().finite().nullish(),
  recommended_roles: z.array(z.string().nullish()).nullish(),
  tech_stack_hints: z.array(z.string().nullish()).nullish(),
  eligibility: z.string().nullish(),
  summary: z.string().nullish(),
});

function parseAiDeadlineToIsoCe(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const isoPrefix = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
  if (isoPrefix?.[1]) {
    return normalizeToIsoCeDate(isoPrefix[1]);
  }

  const slashMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, "0");
    const month = slashMatch[2].padStart(2, "0");
    const year = slashMatch[3];
    return normalizeToIsoCeDate(`${year}-${month}-${day}`);
  }

  const thaiMatch = /^(\d{1,2})\s+([^\s\d]+)\s+(\d{4})$/.exec(trimmed);
  if (thaiMatch) {
    const day = thaiMatch[1].padStart(2, "0");
    const monthToken = thaiMatch[2].trim();
    const year = thaiMatch[3];
    const fullIdx = THAI_MONTHS_FULL.findIndex((m) => m === monthToken);
    const shortIdx = THAI_MONTHS_SHORT.findIndex((m) => m === monthToken);
    const monthNum =
      fullIdx !== -1 ? fullIdx + 1 : shortIdx !== -1 ? shortIdx + 1 : 0;
    if (monthNum >= 1 && monthNum <= 12) {
      return normalizeToIsoCeDate(
        `${year}-${String(monthNum).padStart(2, "0")}-${day}`,
      );
    }
  }

  return null;
}

function coerceTechCategory(raw: string): TechCategory {
  const trimmed = raw.trim();
  if (isTechCategory(trimmed)) {
    return trimmed;
  }
  const lower = trimmed.toLowerCase();
  const matched = TECH_CATEGORIES.find(
    (cat) => cat.toLowerCase() === lower,
  );
  if (matched) {
    return matched;
  }
  if (lower.includes("robot") || lower.includes("iot") || lower.includes("embed") || lower.includes("arduino")) {
    return "Robotics & IoT";
  }
  if (lower.includes("cyber") || lower.includes("ctf") || lower.includes("security")) {
    return "Cybersecurity / CTF";
  }
  if (/\bai\b|\bml\b|data|machine learning|deep learning|ปัญญาประดิษฐ์|เอไอ/.test(lower)) {
    return "AI & Data Science";
  }
  if (lower.includes("game")) {
    return "Game Dev";
  }
  if (/\bui\b|\bux\b|design|ดีไซน์|ออกแบบ/.test(lower)) {
    return "UI/UX & Digital Design";
  }
  if (lower.includes("web") || lower.includes("mobile") || /\bapp\b|แอป/.test(lower)) {
    return "Web & Mobile Dev";
  }
  if (lower.includes("program") || lower.includes("algo") || /\bcp\b|algorithm/.test(lower)) {
    return "Programming / Competitive";
  }
  return "Tech Hackathon & Innovation";
}

function normalizeRecommendedRoles(rawRoles: string[]): string[] {
  const canonical: string[] = [];
  for (const item of rawRoles) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (isTechRole(trimmed)) {
      if (!canonical.includes(trimmed)) canonical.push(trimmed);
      continue;
    }
    const lower = trimmed.toLowerCase();
    const matched = TECH_ROLES.find((role) => role.toLowerCase() === lower);
    if (matched && !canonical.includes(matched)) {
      canonical.push(matched);
    }
  }
  return canonical.slice(0, 6);
}

function stripJsonFence(content: string): string {
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

export type FetchMarkdownResult =
  | { ok: true; url: string; markdown: string }
  | { ok: false; kind: "invalid_url" | "blocked_wall" | "fetch_error"; messageTh: string };

const BLOCKED_MARKERS = [
  "log in to facebook",
  "you must log in to continue",
  "เข้าสู่ระบบ facebook",
  "create new account",
  "sign up for instagram",
  "login • instagram",
  "enable javascript and cookies to continue",
  "please verify you are a human",
  "just a moment...",
];

/**
 * Fetches readable webpage markdown using Jina Reader after SSRF validation.
 */
export async function fetchUrlMarkdown(
  rawUrl: string,
  signal?: AbortSignal,
): Promise<FetchMarkdownResult> {
  let validatedUrl: URL;
  try {
    validatedUrl = validatePublicHttpUrl(rawUrl);
  } catch (error) {
    return {
      ok: false,
      kind: "invalid_url",
      messageTh:
        error instanceof Error ? error.message : "รูปแบบลิงก์ (URL) ไม่ถูกต้อง",
    };
  }

  const targetUrl = validatedUrl.toString();
  const host = validatedUrl.hostname.toLowerCase();
  const jinaUrl = `https://r.jina.ai/${targetUrl}`;

  try {
    const response = await fetch(jinaUrl, {
      method: "GET",
      headers: {
        Accept: "text/markdown, text/plain",
        "X-Return-Format": "markdown",
      },
      signal: signal ?? AbortSignal.timeout(15_000),
    });

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      return {
        ok: false,
        kind: "blocked_wall",
        messageTh:
          "ไม่สามารถเข้าถึงเนื้อหาจากลิงก์นี้ได้โดยตรง (เว็บไซต์ปลายทางจำกัดการเข้าถึงหรือบังคับเข้าสู่ระบบ) กรุณาคัดลอกข้อความประกาศมาวาง หรืออัปโหลดโปสเตอร์แทนครับ",
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        kind: "fetch_error",
        messageTh: `ไม่สามารถดึงข้อมูลจากลิงก์ได้ (HTTP ${response.status}) กรุณาลองวางข้อความประกาศแทน`,
      };
    }

    const text = (await response.text()).trim();
    const lowerText = text.toLowerCase();

    const isSocialLoginWall =
      (host.includes("facebook.com") ||
        host.includes("fb.com") ||
        host.includes("instagram.com")) &&
      (text.length < 400 ||
        BLOCKED_MARKERS.some((marker) => lowerText.includes(marker)));

    if (
      isSocialLoginWall ||
      text.length < 80 ||
      (text.length < 600 &&
        BLOCKED_MARKERS.some((marker) => lowerText.includes(marker)))
    ) {
      return {
        ok: false,
        kind: "blocked_wall",
        messageTh:
          "ลิงก์นี้อาจติดหน้าเข้าสู่ระบบ (เช่น Facebook / Instagram) จึงไม่สามารถอ่านข้อความได้ กรุณาคัดลอกข้อความประกาศมาวางในแท็บ \"วางข้อความ\" หรืออัปโหลดรูปโปสเตอร์แทนครับ",
      };
    }

    return {
      ok: true,
      url: targetUrl,
      markdown: text.slice(0, 14_000),
    };
  } catch {
    return {
      ok: false,
      kind: "fetch_error",
      messageTh:
        "หมดเวลาหรือเกิดข้อผิดพลาดขณะดึงข้อมูลจากลิงก์ กรุณาลองคัดลอกข้อความประกาศมาวางแทน",
    };
  }
}

interface TyphoonRestOcrResponse {
  results?: Array<{
    success?: boolean;
    message?: {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
  }>;
}

/**
 * Extracts text from a competition poster image using Typhoon OCR (/v1/ocr),
 * falling back to /v1/chat/completions with typhoon-ocr-v2 if needed.
 */
export async function extractTextFromPosterImage(
  fileBuffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<string> {
  const config = getTyphoonConfig();
  if (!config.apiKey) {
    throw new Error("ไม่พบการตั้งค่าบริการวิเคราะห์อัตโนมัติ กรุณาตรวจสอบการตั้งค่าระบบ");
  }

  // Primary: OpenTyphoon REST OCR endpoint (/v1/ocr)
  try {
    const form = new FormData();
    const safeBytes = new Uint8Array(fileBuffer);
    form.append("file", new Blob([safeBytes], { type: mimeType }), filename);
    form.append("model", "typhoon-ocr");

    const ocrRes = await fetch(`${config.baseURL}/ocr`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });

    if (ocrRes.ok) {
      const json = (await ocrRes.json()) as TyphoonRestOcrResponse;
      const content =
        json.results?.[0]?.message?.choices?.[0]?.message?.content?.trim();
      if (content && content.length >= 20) {
        return content;
      }
    }
  } catch {
    // Fall through to chat/completions vision OCR fallback
  }

  // Fallback: OpenAI-compatible vision OCR via typhoon-ocr-v2
  const client = createTyphoonClient();
  const base64 = fileBuffer.toString("base64");
  const completion = await client.chat.completions.create({
    model: config.ocrModel,
    temperature: 0.1,
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "ถอดข้อความทั้งหมดจากภาพโปสเตอร์การแข่งขันนี้อย่างละเอียดและถูกต้อง ทั้งภาษาไทยและภาษาอังกฤษ รวมถึงชื่อรายการ วันปิดรับสมัคร คุณสมบัติ ขนาดทีม รางวัล และลิงก์/ช่องทางสมัคร",
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64}`,
            },
          },
        ],
      },
    ],
  });

  const extractedText =
    completion.choices[0]?.message?.content?.trim() ?? "";
  if (!extractedText) {
    throw new Error(
      "ไม่สามารถอ่านข้อความจากภาพโปสเตอร์ได้ กรุณาใช้ภาพที่คมชัดขึ้นหรือวางข้อความประกาศแทน",
    );
  }

  return extractedText;
}

/**
 * Runs unified OpenTyphoon structured extraction with strict Computer & Tech gatekeeper.
 */
export async function extractTechCompetitionFromText(
  rawText: string,
  sourceUrl?: string | null,
  options?: { thailandOnly?: boolean },
  signal?: AbortSignal,
): Promise<ExtractedCompetition> {
  const cleanedText = rawText.trim();
  if (cleanedText.length < 20) {
    throw new Error("ข้อความสั้นเกินไป กรุณาระบุรายละเอียดการแข่งขันให้ชัดเจน");
  }

  const client = createTyphoonClient();
  const config = getTyphoonConfig();
  const dateCtx = getCurrentThaiDateContext();

  const thailandConstraint = options?.thailandOnly
    ? `\n3) เฉพาะการแข่งขันในประเทศไทยเท่านั้น:
- ตั้งค่า "is_tech_related": false ทันที หากเป็นงานแข่งขันในต่างประเทศล้วน (ไม่ใช่รายการที่จัดในไทยหรือเพื่อเยาวชน/นักศึกษาในไทย), เป็นเพียงการแข่งโจทย์รายสัปดาห์อัตโนมัติ (เช่น Codeforces, AtCoder, LeetCode), เป็นเพียงงาน Open House / ค่ายแนะแนว / ข่าวลงนาม MOU / พิธีมอบรางวัล, หรือเป็นการแข่งขัน Policy / แผนธุรกิจการตลาด / วิดีโอสั้น UGC ที่ไม่ได้สร้างซอฟต์แวร์ AI ฮาร์ดแวร์ หรือ Cybersecurity`
    : "";

  const systemPrompt = `คุณคือระบบ AI คัดกรองและสกัดข้อมูลการแข่งขันสำหรับ "ศูนย์รวมการแข่งขันคอมพิวเตอร์และเทคโนโลยี (TechComp Hub)"
วันนี้คือวันที่ ${dateCtx.thaiReadable} (ค.ศ. ${dateCtx.ceDate} / พ.ศ. ${dateCtx.beYear})

หน้าที่สำคัญที่สุด:
1) Strict Relevance Gatekeeper:
- ตั้งค่า "is_tech_related": true เฉพาะเมื่อเป็นการแข่งขันด้านคอมพิวเตอร์ ไอที หรือเทคโนโลยีดิจิทัลอย่างแท้จริง ได้แก่:
  * Programming / Competitive (เขียนโปรแกรมแข่งขัน อัลกอริทึม โอลิมปิกคอมพิวเตอร์ TOI ICPC)
  * AI & Data Science (AI, ML, Deep Learning, LLM, Data Analytics, Computer Vision)
  * Web & Mobile Dev (พัฒนาเว็บ แอปพลิเคชัน ซอฟต์แวร์ NSC YWC)
  * Cybersecurity / CTF (ความมั่นคงปลอดภัยไซเบอร์ Capture The Flag)
  * Robotics & IoT (หุ่นยนต์ Arduino ESP32 ROS ระบบสมองกลฝังตัว โดรน)
  * Game Dev (พัฒนาเกม Game Jam Unity Godot)
  * Tech Hackathon & Innovation (แฮกกาธอน นวัตกรรมดิจิทัล Tech Startup ที่สร้างซอฟต์แวร์/ฮาร์ดแวร์/AI)
  * UI/UX & Digital Design (ออกแบบ UI/UX ผลิตภัณฑ์ดิจิทัล Prototype)
- ตั้งค่า "is_tech_related": false ทันที สำหรับการแข่งขันที่ไม่ใช่สายคอมพิวเตอร์/เทคโนโลยี เช่น เรียงความ ภาษา วาดภาพ/ศิลปะทั่วไป ร้องเพลง ดนตรี กีฬา คณิตศาสตร์/ฟิสิกส์/เคมี/ชีววิทยาเพียว ๆ ที่ไม่มีการเขียนโปรแกรมหรือสร้างนวัตกรรมดิจิทัล หรือประกวดแผนธุรกิจ/นโยบายทั่วไปที่ไม่ได้พัฒนาซอฟต์แวร์/เทคโนโลยี พร้อมระบุเหตุผลภาษาไทยที่ชัดเจนใน "rejection_reason"

2) แปลงวันที่ พ.ศ. เป็น ค.ศ. เสมอ:
- หากข้อความระบุปี พ.ศ. (เช่น 2569, 2570 หรือ '69) ให้ลบด้วย 543 เพื่อแปลงเป็น ค.ศ. ในรูปแบบ "YYYY-MM-DD" เท่านั้น (เช่น 30 ธันวาคม 2569 -> "2026-12-30")
- หากไม่ระบุปี ให้ประเมินปีที่เหมาะสมเทียบกับวันนี้ (${dateCtx.ceDate}) หากไม่พบวันปิดรับสมัครเลยให้ตอบ null${thailandConstraint}

รูปแบบ JSON ที่ต้องตอบกลับเท่านั้น (ห้ามมีข้อความอื่นนอก JSON):
{
  "is_tech_related": boolean,
  "rejection_reason": string | null,
  "title": string,
  "category": "Programming / Competitive" | "AI & Data Science" | "Web & Mobile Dev" | "Cybersecurity / CTF" | "Robotics & IoT" | "Game Dev" | "Tech Hackathon & Innovation" | "UI/UX & Digital Design",
  "deadline": "YYYY-MM-DD" | null,
  "min_size": number,
  "max_size": number,
  "recommended_roles": string[],
  "tech_stack_hints": string[],
  "eligibility": string | null,
  "summary": string
}

กติกาเพิ่มเติมของฟิลด์:
- "recommended_roles": เลือกเฉพาะจากรายการต่อไปนี้ 1-5 ตำแหน่ง: ${TECH_ROLES.join(", ")}
- "tech_stack_hints": ระบุชื่อภาษา/เฟรมเวิร์ก/เครื่องมือที่เกี่ยวข้องไม่เกิน 8 คำ (เช่น Python, Next.js, ESP32, PyTorch, Figma)
- "min_size" และ "max_size": จำนวนสมาชิกต่อทีม (integer >= 1, โดย max_size >= min_size) ถ้าแข่งเดี่ยวให้ min_size=1, max_size=1 ถ้าไม่ระบุให้ min_size=1, max_size=4
- "eligibility" และ "summary": สรุปเป็นภาษาไทยที่อ่านเข้าใจง่าย กระชับ ชัดเจน`;

  const userPrompt = [
    sourceUrl ? `URL แหล่งที่มา: ${sourceUrl}` : null,
    "เนื้อหาประกาศ/รายละเอียดการแข่งขัน:",
    cleanedText.slice(0, 28_000),
  ]
    .filter(Boolean)
    .join("\n\n");

  const completion = await client.chat.completions.create({
    model: config.textModel,
    temperature: 0.1,
    max_tokens: 1500,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  }, signal ? { signal } : undefined);

  const rawContent = completion.choices[0]?.message?.content;
  if (!rawContent) {
    throw new Error("ไม่ได้รับผลการวิเคราะห์ กรุณาลองใหม่อีกครั้ง");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(stripJsonFence(rawContent));
  } catch {
    throw new Error("AI ส่งข้อมูลรูปแบบ JSON ไม่สมบูรณ์ กรุณาลองใหม่อีกครั้ง");
  }

  const parsed = rawAiExtractionSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error("ไม่สามารถแปลงข้อมูลการแข่งขันจากผลลัพธ์ AI ได้");
  }

  const data = parsed.data;
  const isTechRelated = Boolean(data.is_tech_related);
  const rawMin = data.min_size && data.min_size >= 1 ? data.min_size : 1;
  const rawMax = data.max_size && data.max_size >= 1 ? data.max_size : 4;
  const minSize = Math.max(1, Math.min(20, Math.round(rawMin)));
  const maxSize = Math.max(minSize, Math.min(20, Math.round(rawMax)));
  const category = coerceTechCategory(data.category ?? "Tech Hackathon & Innovation");
  const deadline = parseAiDeadlineToIsoCe(data.deadline ?? null);
  const cleanRoles = (data.recommended_roles ?? []).filter(
    (r): r is string => typeof r === "string" && r.trim().length > 0,
  );
  const cleanHints = (data.tech_stack_hints ?? []).filter(
    (t): t is string => typeof t === "string" && t.trim().length > 0,
  );
  const recommendedRoles = normalizeRecommendedRoles(cleanRoles);
  const techStackHints = Array.from(
    new Set(cleanHints.map((s) => s.trim()).filter(Boolean)),
  ).slice(0, 10);

  return {
    is_tech_related: isTechRelated,
    rejection_reason: isTechRelated
      ? null
      : data.rejection_reason?.trim() ||
        "รายการนี้ไม่เข้าข่ายการแข่งขันด้านคอมพิวเตอร์ ซอฟต์แวร์ หรือเทคโนโลยีดิจิทัล",
    title: data.title?.trim() || "ไม่ระบุชื่อรายการแข่งขัน",
    category,
    deadline,
    min_size: minSize,
    max_size: maxSize,
    recommended_roles:
      recommendedRoles.length > 0 ? recommendedRoles : ["Full-Stack"],
    tech_stack_hints: techStackHints,
    eligibility: data.eligibility?.trim() || null,
    summary: data.summary?.trim() || "ไม่มีคำอธิบายเพิ่มเติม",
  };
}
