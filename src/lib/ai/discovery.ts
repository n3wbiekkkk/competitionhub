import { z } from "zod";
import { createTyphoonClient, isTyphoonConfigured } from "@/lib/ai/opentyphoon";
import type { TechCategory } from "@/lib/constants/tech-taxonomy";
import type { Competition } from "../../types/database.ts";
import { logError } from "@/lib/utils/logger";

const categorySignals: ReadonlyArray<{ category: TechCategory; pattern: RegExp }> = [
  { category: "Robotics & IoT", pattern: /หุ่นยนต์|robot|arduino|esp32|iot|embedded/i },
  { category: "AI & Data Science", pattern: /\bai\b|เอไอ|ปัญญาประดิษฐ์|machine learning|data scien|data\b|ml\b/i },
  { category: "Tech Hackathon & Innovation", pattern: /hackathon|แฮกกาธอน|แฮก|นวัตกรรม|startup|innovation/i },
  { category: "Game Dev", pattern: /เกม|game|unity|godot/i },
  { category: "Web & Mobile Dev", pattern: /เว็บ|web|แอป|mobile|software|แอพ/i },
  { category: "UI/UX & Digital Design", pattern: /ออกแบบ|ดีไซน์|ux|ui|figma|design/i },
  { category: "Cybersecurity / CTF", pattern: /ctf|cyber|ความปลอดภัย|ไซเบอร์|security/i },
  { category: "Programming / Competitive", pattern: /algorithm|programming|toi|posn|\bcp\b|โปรแกรม|อัลกอ/i },
];

export interface DiscoveryIntent {
  categories: TechCategory[];
  teamSize: number | null;
  highSchoolOnly: boolean;
  universityOnly: boolean;
  hasDeadlineWindow: boolean;
}

export function parseDiscoveryQuery(query: string): DiscoveryIntent {
  const normalized = query.toLowerCase().trim();
  const categories = categorySignals
    .filter(({ pattern }) => pattern.test(normalized))
    .map(({ category }) => category);
  const range = normalized.match(/(?:ทีม(?:ละ)?|จำนวน)\s*(\d{1,2})\s*[-–]\s*(\d{1,2})\s*คน?/);
  const team = normalized.match(/(?:ทีม(?:ละ)?|จำนวน)\s*(\d{1,2})\s*(?:คน)?/) ??
    normalized.match(/(\d{1,2})\s*คน(?:ในทีม|ต่อทีม)?/);
  const numeric = range?.[1] ?? team?.[1];
  const parsedSize = numeric ? Number(numeric) : NaN;
  const teamSize = /เดี่ยว|คนเดียว/.test(normalized)
    ? 1
    : Number.isInteger(parsedSize) && parsedSize >= 1 && parsedSize <= 20
      ? parsedSize
      : null;
  return {
    categories,
    teamSize,
    highSchoolOnly: /นักเรียน|มัธยม|ม\.ปลาย|ม\.ต้น|ปวช|เยาวชน|high school/.test(normalized),
    universityOnly: /มหาวิทยาลัย|นิสิต|นักศึกษา|ป\.ตรี|ปวส|university/.test(normalized),
    hasDeadlineWindow: /ภายใน|ก่อนสิ้น|เร็วๆนี้|ใกล้ปิด/.test(normalized),
  };
}

export function filterDiscoveryCandidates(
  competitions: readonly Competition[],
  intent: DiscoveryIntent,
  todayIso: string,
): readonly Competition[] {
  return competitions.filter((competition) => {
    if (competition.status !== "open") return false;
    if (competition.deadline !== null && competition.deadline < todayIso) return false;
    if (intent.teamSize !== null && (competition.min_size > intent.teamSize || competition.max_size < intent.teamSize)) return false;
    const levelText = `${competition.eligibility ?? ""} ${competition.title}`.toLowerCase();
    if (intent.highSchoolOnly && !intent.universityOnly && /มหาวิทยาลัย|นิสิต|นักศึกษา|ป\.ตรี|ปวส|university/.test(levelText) && !/มัธยม|นักเรียน|ปวช|เยาวชน|high school|ทุกระดับ|บุคคลทั่วไป/.test(levelText)) return false;
    if (intent.universityOnly && !intent.highSchoolOnly && /มัธยม|นักเรียน|high school|ปวช/.test(levelText) && !/มหาวิทยาลัย|นิสิต|นักศึกษา|university|ทุกระดับ|บุคคลทั่วไป/.test(levelText)) return false;
    return true;
  });
}

export function scoreDiscoveryCompetition(
  competition: Competition,
  intent: DiscoveryIntent,
  skills: readonly string[],
  todayIso: string,
): number {
  const haystack = [competition.title, competition.summary ?? "", competition.eligibility ?? "", ...competition.tech_stack_hints].join(" ").toLowerCase();
  let score = 0;
  if (intent.categories.length === 0) score += 1;
  if (intent.categories.includes(competition.category)) score += 6;
  for (const { category, pattern } of categorySignals) {
    if (intent.categories.includes(category) && pattern.test(haystack)) score += 2;
  }
  for (const skill of skills) {
    const fragments = skill.toLowerCase().split(/[/,\s]+/).filter((part) => part.length >= 2);
    if (fragments.some((fragment) => haystack.includes(fragment))) score += 2;
  }
  if (intent.teamSize !== null && competition.min_size <= intent.teamSize && competition.max_size >= intent.teamSize) score += 3;
  if (competition.deadline === null) return score;
  const days = Math.floor((Date.parse(`${competition.deadline}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / 86_400_000);
  return score + (days >= 0 && days <= 30 ? 1 : 0);
}

export function rankFallbackCompetitions(
  competitions: readonly Competition[],
  intent: DiscoveryIntent,
  skills: readonly string[],
  todayIso: string,
): Array<{ competition: Competition; reasons: string[] }> {
  return competitions
    .map((competition) => ({ competition, score: scoreDiscoveryCompetition(competition, intent, skills, todayIso) }))
    .sort((a, b) => b.score - a.score || (a.competition.deadline ?? "9999-12-31").localeCompare(b.competition.deadline ?? "9999-12-31"))
    .slice(0, 6)
    .map(({ competition }) => {
      const reasons = [];
      if (intent.categories.includes(competition.category)) reasons.push("ตรงกับสายงานที่คุณบอก");
      if (intent.teamSize !== null) reasons.push(`รองรับทีม ${intent.teamSize} คนตามเงื่อนไขที่ระบุ`);
      if (competition.deadline) reasons.push("ยังเปิดรับสมัครอยู่ตามวันปิดรับในระบบ");
      reasons.push(competition.min_size === competition.max_size ? `กำหนดสมาชิกทีม ${competition.min_size} คน` : `รองรับทีม ${competition.min_size}–${competition.max_size} คน`);
      return { competition, reasons: reasons.slice(0, 3) };
    });
}

const aiRankingItemSchema = z.object({
  id: z.string().uuid(),
  reasons: z.array(z.string().trim().min(2).max(200)).max(3).optional(),
  reason: z.string().trim().min(2).max(240).optional(),
  reason_th: z.string().trim().min(2).max(240).optional(),
});

const aiRankingSchema = z.object({
  results: z.array(z.unknown()).max(20),
});

export type AiDiscoveryRanking = { results: Array<{ id: string; reasons: string[] }> };

export function parseAiDiscoveryResponse(content: string, allowedIds: ReadonlySet<string>): AiDiscoveryRanking | null {
  try {
    const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const parsed = aiRankingSchema.safeParse(JSON.parse(cleaned.slice(start, end + 1)));
    if (!parsed.success) return null;
    const seen = new Set<string>();
    const results: AiDiscoveryRanking["results"] = [];
    for (const rawItem of parsed.data.results) {
      const item = aiRankingItemSchema.safeParse(rawItem);
      if (!item.success) continue;
      if (!allowedIds.has(item.data.id) || seen.has(item.data.id)) continue;
      const reasons = item.data.reasons ??
        [item.data.reason, item.data.reason_th].filter((value): value is string => Boolean(value));
      if (reasons.length === 0) continue;
      seen.add(item.data.id);
      results.push({ id: item.data.id, reasons: reasons.slice(0, 3) });
      if (results.length >= 8) break;
    }
    return results.length > 0 ? { results } : null;
  } catch {
    return null;
  }
}

export async function rankCompetitionsWithAi(input: {
  query: string;
  competitions: readonly Competition[];
  skills: readonly string[];
  todayIso: string;
}): Promise<{ ranking: AiDiscoveryRanking | null; error: string | null }> {
  if (!isTyphoonConfigured()) return { ranking: null, error: "AI ยังไม่ได้เชื่อมต่อในขณะนี้" };

  const candidates = input.competitions.map((competition) => ({
    id: competition.id,
    title: competition.title,
    category: competition.category,
    deadline_ce: competition.deadline,
    team_size: `${competition.min_size}-${competition.max_size}`,
    roles: competition.recommended_roles,
    technologies: competition.tech_stack_hints,
    eligibility: (competition.eligibility ?? "").slice(0, 220),
    summary: (competition.summary ?? "").slice(0, 380),
  }));

  try {
    const client = createTyphoonClient();
    const completion = await client.chat.completions.create({
      model: process.env.TYPHOON_TEXT_MODEL?.trim() || "typhoon-v2.5-30b-a3b-instruct",
      temperature: 0,
      max_tokens: 1000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `คุณเป็นตัวจัดอันดับการแข่งขัน ไม่ใช่ตัวสร้างข้อมูล เลือก 1–6 รายการที่เหมาะกับคำขอนักเรียนที่สุดจาก JSON ที่ให้เท่านั้น\nวันนี้ ${input.todayIso} ค.ศ.\nกฎ: id ต้องมาจาก JSON เท่านั้น ห้ามสร้างรายการ วันที่ คุณสมบัติ หรือเทคโนโลยีใหม่\nเหตุผลภาษาไทย 1–3 ข้อสั้นๆ อ้างเฉพาะข้อมูลในข้อมูลรายการกับคำขอ; หากไม่แน่ใจให้เตือนตรวจประกาศต้นทาง\nตอบเฉพาะ JSON {"results":[{"id":"uuid","reasons":["เหตุผล"]}]} ถ้าไม่เหมาะเลยให้ results=[]`,
        },
        { role: "user", content: JSON.stringify({ request: input.query, skills: input.skills, candidates }) },
      ],
    }, { timeout: 15_000, maxRetries: 0 });
    const content = completion.choices[0]?.message?.content;
    const parsedRanking = content
      ? parseAiDiscoveryResponse(content, new Set(input.competitions.map((competition) => competition.id)))
      : null;
    if (content && !parsedRanking) {
      logError("[ai/discovery] invalid ranking payload", content.slice(0, 1600));
    }
    return {
      ranking: parsedRanking,
      error: content ? null : "AI ไม่ได้ส่งผลลัพธ์กลับมา",
    };
  } catch (error) {
    logError("[ai/discovery] ranking error", error);
    return { ranking: null, error: "AI ไม่ตอบสนองในขณะนี้" };
  }
}
