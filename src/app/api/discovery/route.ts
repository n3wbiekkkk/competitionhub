import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { getAuthenticatedProfile } from "@/lib/auth/cookies";
import { filterDiscoveryCandidates, parseDiscoveryQuery, rankCompetitionsWithAi, rankFallbackCompetitions, scoreDiscoveryCompetition } from "@/lib/ai/discovery";
import { withUserDb } from "@/lib/db/pool";
import { getRequestIp } from "@/lib/utils/request-ip";
import { getTodayIsoBangkok } from "@/lib/utils/thai-date";
import type { Competition } from "@/types/database";
import { logError } from "@/lib/utils/logger";

const requestSchema = z.object({
  query: z.string().trim().min(2, "บอกเราก่อนว่าอยากแข่งอะไร").max(300),
});

export async function POST(request: Request) {
  const user = await getAuthenticatedProfile();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const limitKey = user ? `discovery:user:${user.id}` : `discovery:ip:${getRequestIp(request)}`;
  if (!(await consumeRateLimit(limitKey, 20, 3_600_000)).allowed) {
    return NextResponse.json(
      { error: "ค้นหาด้วย AI มากเกินไป กรุณารอสักครู่แล้วลองใช้อีกครั้ง" },
      { status: 429 },
    );
  }

  try {
    const allCompetitions = await withUserDb(user?.id ?? null, async (client) => {
      const result = await client.query<Competition>(
        `SELECT id, title, category, deadline::text, min_size, max_size,
                recommended_roles, tech_stack_hints, eligibility, summary,
                source_url, source_type, status, created_by,
                created_at::text, updated_at::text
         FROM public.competitions
         WHERE status = 'open' AND (deadline IS NULL OR deadline >= CURRENT_DATE)
         ORDER BY deadline ASC NULLS LAST, created_at DESC
         LIMIT 100`,
      );
      return result.rows;
    });

    const todayIso = getTodayIsoBangkok();
    const intent = parseDiscoveryQuery(parsed.data.query);
    const strictCandidates = filterDiscoveryCandidates(allCompetitions, intent, todayIso);
    const relaxedIntent = { ...intent, teamSize: null, highSchoolOnly: false, universityOnly: false };
    const candidates = strictCandidates.length > 0
      ? strictCandidates
      : filterDiscoveryCandidates(allCompetitions, relaxedIntent, todayIso);
    const effectiveIntent = strictCandidates.length > 0 ? intent : relaxedIntent;
    const skills = user?.skills ?? [];

    if (candidates.length === 0) {
      return NextResponse.json({
        mode: "fallback", results: [],
        message: "ยังไม่มีรายการเปิดรับสมัครที่ใช้ได้ในฐานข้อมูล ลองดูคลังรายการหรือเพิ่มรายการใหม่",
      });
    }

    const ranked = await rankCompetitionsWithAi({
      query: parsed.data.query,
      competitions: candidates
        .map((competition) => ({ competition, score: scoreDiscoveryCompetition(competition, effectiveIntent, skills, todayIso) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 24)
        .map(({ competition }) => competition),
      skills,
      todayIso,
    });

    const fallback = rankFallbackCompetitions(candidates, effectiveIntent, skills, todayIso);
    if (!ranked.ranking) {
      return NextResponse.json({
        mode: "fallback",
        results: fallback,
        message: `${ranked.error ?? "AI ประมวลผลไม่สำเร็จ"} จึงแสดงรายการที่ตรงเงื่อนไขและใกล้ปิดรับแทน${strictCandidates.length === 0 ? " (ไม่พบทีม/คุณสมบัติตรงเป๊ะ จึงผ่อนเงื่อนไขบางส่วน)" : ""}`,
      });
    }

    const byId = new Map(candidates.map((competition) => [competition.id, competition]));
    const results = ranked.ranking.results.flatMap((item) => {
      const competition = byId.get(item.id);
      return competition ? [{ competition, reasons: item.reasons }] : [];
    });
    if (results.length === 0) {
      return NextResponse.json({ mode: "fallback", results: fallback, message: "ไม่พบรายการที่ตรงชัดเจน ลองดูรายการใกล้เคียงเหล่านี้" });
    }
    return NextResponse.json({ mode: "ai", results });
  } catch (error) {
    logError("[api/discovery] error", error);
    return NextResponse.json({ error: "ค้นหารายการไม่สำเร็จชั่วคราว ลองใช้ช่องค้นหาปกติแทน" }, { status: 500 });
  }
}
