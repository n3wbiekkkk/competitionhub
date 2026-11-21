import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import {
  createTyphoonClient,
  getTyphoonConfig,
  isTyphoonConfigured,
} from "@/lib/ai/opentyphoon";
import {
  calculateSubmissionReadiness,
  RUBRIC_DIMENSIONS,
  RUBRIC_DIMENSION_IDS,
  roadmapPlanSchema,
  rubricPlanSchema,
  type RoadmapPlan,
  type RubricReviewPlan,
  type TeamDeliverable,
  type TeamTaskSummary,
} from "@/components/prep-studio/shared";

export {
  RUBRIC_DIMENSIONS,
  RUBRIC_DIMENSION_IDS,
  roadmapPlanSchema,
  rubricPlanSchema,
  type RoadmapPlan,
  type RubricReviewPlan,
} from "@/components/prep-studio/shared";
import {
  formatThaiDate,
  getCurrentThaiDateContext,
  getDeadlineCountdown,
  getTodayIsoBangkok,
  normalizeToIsoCeDate,
  parseIsoDateParts,
} from "@/lib/utils/thai-date";
import { validatePublicHttpUrl } from "@/lib/utils/url-safety";

export const ROADMAP_PROMPT_VERSION = "roadmap-th-v1";
export const RUBRIC_PROMPT_VERSION = "rubric-th-v1";

export const PREP_PLAN_KINDS = ["roadmap", "rubric_review"] as const;
export type PrepPlanKind = (typeof PREP_PLAN_KINDS)[number];

export type PrepPlan = RoadmapPlan | RubricReviewPlan;

export interface PrepTeamMember {
  userId: string;
  fullName: string;
  nickname: string | null;
  assignedRole: string;
  skills: string[];
}

export interface PrepTeamContext {
  teamId: string;
  teamName: string;
  status: string;
  competitionId: string;
  competitionTitle: string;
  category: string;
  deadline: string | null;
  summary: string | null;
  eligibility: string | null;
  techStackHints: string[];
  recommendedRoles: string[];
  members: PrepTeamMember[];
  tasks: TeamTaskSummary[];
  deliverables: TeamDeliverable[];
  todayIso: string;
}

export interface CachedPlanRecord {
  id: string;
  inputHash: string;
  plan: unknown;
  createdAt: string;
  updatedAt: string;
}

export const deliverableInputSchema = z.object({
  title: z.string().trim().min(3, "กรุณาระบุชื่อผลงานอย่างน้อย 3 ตัวอักษร").max(120),
  kind: z.enum(["source_code", "prototype", "document", "demo_video", "other"]),
  url: z
    .string()
    .trim()
    .min(1, "กรุณาระบุลิงก์ผลงาน")
    .max(2000, "ลิงก์ผลงานยาวเกินไป")
    .refine((value) => {
      try {
        validatePublicHttpUrl(value);
        return true;
      } catch {
        return false;
      }
    }, "ลิงก์ผลงานต้องเป็น URL สาธารณะ http/https เท่านั้น"),
  note: z.string().trim().max(500, "หมายเหตุยาวเกินไป").nullish(),
});

export type DeliverableInput = z.infer<typeof deliverableInputSchema>;

const rawRoadmapOutputSchema = z.object({
  summary_th: z.string(),
  suggested_stack: z.array(z.string()),
  weeks: z.array(
    z.object({
      week: z.coerce.number().int(),
      title_th: z.string(),
      focus_th: z.string(),
      tasks_th: z.array(z.string()),
      milestone_th: z.string(),
    }),
  ),
  risks_th: z.array(z.string()),
});

const rawRubricOutputSchema = z.object({
  summary_th: z.string(),
  scores: z.array(
    z.object({
      dimension_id: z.string(),
      score: z.coerce.number().finite(),
      evidence_th: z.string(),
      improvement_th: z.string(),
    }),
  ),
  top_improvements_th: z.array(z.string()),
  missing_items_th: z.array(z.string()).nullish(),
  verdict_th: z.string(),
});

function stripJsonFence(content: string): string {
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (fenced?.[1]) return fenced[1].trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

function cleanStringList(
  values: string[],
  options: { max: number; minLength: number; minimum: number },
): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length >= options.minLength) seen.add(trimmed);
  }
  const result = Array.from(seen).slice(0, options.max);
  if (result.length < options.minimum) return [];
  return result;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`;
}

export function computeInputHash(payload: unknown): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

export function addDaysIso(isoDate: string, days: number): string {
  const parts = parseIsoDateParts(isoDate);
  if (!parts) {
    throw new Error("วันที่ไม่ถูกต้อง");
  }
  const shifted = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days),
  );
  return `${String(shifted.getUTCFullYear()).padStart(4, "0")}-${String(
    shifted.getUTCMonth() + 1,
  ).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

export function decideWeekCount(
  deadline: string | null,
  todayIso: string = getTodayIsoBangkok(),
  requested?: number,
): number {
  if (requested !== undefined && Number.isFinite(requested)) {
    return Math.max(2, Math.min(8, Math.trunc(requested)));
  }
  const countdown = getDeadlineCountdown(deadline, todayIso);
  const days = countdown.daysRemaining;
  if (days === null || days < 0) return 4;
  return Math.max(2, Math.min(6, Math.ceil((days + 1) / 7)));
}

export function buildRoadmapInput(
  context: PrepTeamContext,
  weekCount: number,
  model: string,
): Record<string, unknown> {
  return {
    version: ROADMAP_PROMPT_VERSION,
    model,
    todayIso: context.todayIso,
    weekCount,
    team: { id: context.teamId, name: context.teamName },
    competition: {
      id: context.competitionId,
      title: context.competitionTitle,
      category: context.category,
      deadline: context.deadline,
      summary: context.summary,
      eligibility: context.eligibility,
      techStackHints: [...context.techStackHints].sort(),
      recommendedRoles: [...context.recommendedRoles].sort(),
    },
    members: context.members
      .map((member) => ({
        userId: member.userId,
        fullName: member.fullName,
        nickname: member.nickname,
        assignedRole: member.assignedRole,
        skills: [...member.skills].sort(),
      }))
      .sort((left, right) => left.userId.localeCompare(right.userId)),
    tasks: context.tasks
      .map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        dueDate: task.due_date,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    deliverables: context.deliverables
      .map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        url: item.url,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function buildReviewInput(
  context: PrepTeamContext,
  model: string,
): Record<string, unknown> {
  const readiness = calculateSubmissionReadiness({
    tasks: context.tasks,
    deliverables: context.deliverables,
    deadline: context.deadline,
    todayIso: context.todayIso,
  });
  return {
    version: RUBRIC_PROMPT_VERSION,
    model,
    todayIso: context.todayIso,
    team: { id: context.teamId, name: context.teamName },
    competition: {
      id: context.competitionId,
      title: context.competitionTitle,
      category: context.category,
      deadline: context.deadline,
      summary: context.summary,
      eligibility: context.eligibility,
      techStackHints: [...context.techStackHints].sort(),
      recommendedRoles: [...context.recommendedRoles].sort(),
    },
    members: context.members
      .map((member) => ({
        userId: member.userId,
        fullName: member.fullName,
        nickname: member.nickname,
        assignedRole: member.assignedRole,
        skills: [...member.skills].sort(),
      }))
      .sort((left, right) => left.userId.localeCompare(right.userId)),
    tasks: context.tasks
      .map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        dueDate: task.due_date,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    deliverables: context.deliverables
      .map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        url: item.url,
        note: item.note,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    readinessScore: readiness.score,
  };
}

export function parseRoadmapOutput(
  raw: unknown,
  options: {
    weekCount: number;
    todayIso: string;
    deadline: string | null;
    generatedAt: string;
  },
): RoadmapPlan {
  const parsed = rawRoadmapOutputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("AI ส่งแผนการแข่งขันในรูปแบบที่ไม่ถูกต้อง");
  }

  const summaryTh = parsed.data.summary_th.trim();
  if (summaryTh.length < 10) {
    throw new Error("AI ส่งคำสรุปแผนที่สั้นเกินไป");
  }
  const suggestedStack = cleanStringList(parsed.data.suggested_stack, {
    max: 10,
    minLength: 1,
    minimum: 1,
  });
  if (suggestedStack.length === 0) {
    throw new Error("AI ไม่ได้ระบุสแตกเทคโนโลยีที่แนะนำ");
  }

  if (parsed.data.weeks.length !== options.weekCount) {
    throw new Error("AI ส่งจำนวนสัปดาห์ไม่ตรงกับช่วงเวลาที่กำหนด");
  }
  const sortedWeeks = [...parsed.data.weeks].sort(
    (left, right) => left.week - right.week,
  );
  const normalizedDeadline = normalizeToIsoCeDate(options.deadline);
  const deadlineUsable =
    normalizedDeadline !== null && normalizedDeadline >= options.todayIso;

  const weeks = sortedWeeks.map((week, index) => {
    if (week.week !== index + 1) {
      throw new Error("ลำดับสัปดาห์จาก AI ไม่ต่อเนื่อง");
    }
    const focusTh = week.focus_th.trim();
    const milestoneTh = week.milestone_th.trim();
    const tasksTh = cleanStringList(week.tasks_th, {
      max: 5,
      minLength: 3,
      minimum: 1,
    });
    if (!focusTh || !milestoneTh || tasksTh.length === 0) {
      throw new Error("ข้อมูลรายสัปดาห์จาก AI ไม่ครบถ้วน");
    }
    const plannedDate = addDaysIso(options.todayIso, index * 7);
    const dueDate =
      deadlineUsable && normalizedDeadline && plannedDate > normalizedDeadline
        ? normalizedDeadline
        : deadlineUsable
          ? plannedDate
          : null;
    return {
      week: index + 1,
      labelTh: `สัปดาห์ที่ ${index + 1}`,
      focusTh,
      dueDate,
      tasksTh,
      milestoneTh,
    };
  });

  const risksTh = cleanStringList(parsed.data.risks_th, {
    max: 6,
    minLength: 3,
    minimum: 1,
  });
  if (risksTh.length === 0) {
    throw new Error("AI ไม่ได้ระบุความเสี่ยงของโปรเจกต์");
  }

  return roadmapPlanSchema.parse({
    version: 1,
    kind: "roadmap",
    summaryTh,
    suggestedStack,
    weeks,
    risksTh,
    generatedAt: options.generatedAt,
  });
}

export function parseRubricReviewOutput(
  raw: unknown,
  options: { generatedAt: string },
): RubricReviewPlan {
  const parsed = rawRubricOutputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("AI ส่งผลตรวจ Rubric ในรูปแบบที่ไม่ถูกต้อง");
  }

  const summaryTh = parsed.data.summary_th.trim();
  const verdictTh = parsed.data.verdict_th.trim();
  if (summaryTh.length < 10 || verdictTh.length < 8) {
    throw new Error("AI ส่งบทสรุปการตรวจที่สั้นเกินไป");
  }
  if (parsed.data.scores.length !== RUBRIC_DIMENSION_IDS.length) {
    throw new Error("AI ส่งคะแนน Rubric ไม่ครบทุกด้าน");
  }

  const scores = RUBRIC_DIMENSIONS.map((dimension) => {
    const found = parsed.data.scores.find(
      (item) => item.dimension_id === dimension.id,
    );
    if (!found) {
      throw new Error("AI ส่งคะแนน Rubric ไม่ครบทุกด้าน");
    }
    const evidenceTh = found.evidence_th.trim();
    const improvementTh = found.improvement_th.trim();
    if (
      !Number.isInteger(found.score) ||
      found.score < 0 ||
      found.score > dimension.maxScore ||
      evidenceTh.length < 8 ||
      improvementTh.length < 8
    ) {
      throw new Error("คะแนนหรือคำแนะนำจาก AI ไม่อยู่ในเกณฑ์ที่กำหนด");
    }
    return {
      dimensionId: dimension.id,
      labelTh: dimension.labelTh,
      score: found.score,
      maxScore: dimension.maxScore,
      evidenceTh,
      improvementTh,
    };
  });

  const topImprovementsTh = cleanStringList(parsed.data.top_improvements_th, {
    max: 5,
    minLength: 8,
    minimum: 3,
  });
  if (topImprovementsTh.length === 0) {
    throw new Error("AI ไม่ได้ระบุคำแนะนำที่นำไปปฏิบัติได้");
  }
  const missingItemsTh = cleanStringList(parsed.data.missing_items_th ?? [], {
    max: 8,
    minLength: 3,
    minimum: 0,
  });

  return rubricPlanSchema.parse({
    version: 1,
    kind: "rubric_review",
    summaryTh,
    totalScore: scores.reduce((total, item) => total + item.score, 0),
    maxScore: 100,
    scores,
    topImprovementsTh,
    missingItemsTh,
    verdictTh,
    generatedAt: options.generatedAt,
  });
}

export function parseStoredRoadmapPlan(raw: unknown): RoadmapPlan | null {
  const parsed = roadmapPlanSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

async function requestJsonCompletion(
  systemPrompt: string,
  userPrompt: string,
): Promise<unknown> {
  if (!isTyphoonConfigured()) {
    throw new Error("ยังไม่ได้ตั้งค่าบริการวิเคราะห์อัตโนมัติในระบบ");
  }
  const config = getTyphoonConfig();
  const client = createTyphoonClient();
  const completion = await client.chat.completions.create(
    {
      model: config.textModel,
      temperature: 0.2,
      max_tokens: 2400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    },
    { signal: AbortSignal.timeout(45_000) },
  );
  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("ไม่ได้รับผลการวิเคราะห์จาก AI กรุณาลองใหม่อีกครั้ง");
  }
  try {
    return JSON.parse(stripJsonFence(content));
  } catch {
    throw new Error("AI ส่งข้อมูลรูปแบบ JSON ไม่สมบูรณ์ กรุณาลองใหม่อีกครั้ง");
  }
}

export async function createRoadmapPlan(input: {
  context: PrepTeamContext;
  weekCount: number;
}): Promise<RoadmapPlan> {
  const generatedAt = new Date().toISOString();
  const dateContext = getCurrentThaiDateContext();
  const deadlineLabel = input.context.deadline
    ? formatThaiDate(input.context.deadline, "long")
    : "ยังไม่ระบุกำหนดปิดรับ";
  const systemPrompt = `คุณเป็นโค้ชการแข่งขันด้านคอมพิวเตอร์และเทคโนโลยีของโรงเรียนในประเทศไทย
ตอบกลับด้วย JSON เท่านั้น ห้ามมีข้อความหรือคำอธิบายนอก JSON และใช้ภาษาไทยสั้น ๆ เสมอ

บริบทวันนี้: ${dateContext.thaiReadable} (ค.ศ. ${dateContext.ceDate} / พ.ศ. ${dateContext.beYear})
วันปิดรับสมัคร: ${deadlineLabel}
จำนวนสัปดาห์ที่ต้องวางแผน: ${input.weekCount}

กติกา:
- แบ่งแผนเป็น ${input.weekCount} สัปดาห์ เรียง week จาก 1 ถึง ${input.weekCount} ไม่ขาดไม่ซ้ำ
- เขียน title_th, focus_th, tasks_th และ milestone_th เป็นภาษาไทยที่นำไปทำได้จริง
- tasks_th ของแต่ละสัปดาห์มี 1-5 ข้อ แต่ละข้อเป็นงานเฉพาะเจาะจง ไม่ใช่คำกว้าง ๆ
- suggested_stack ระบุภาษา เฟรมเวิร์ก หรือเครื่องมือ 1-10 รายการที่ทีมควรใช้จริง
- risks_th ระบุความเสี่ยง 1-6 ข้อ พร้อมแนวทางป้องกันสั้น ๆ
- อย่าสร้างข้อมูลส่วนตัว อย่าอ้างอิงลิงก์ภายนอก และอย่าให้คะแนน

รูปแบบ JSON ที่ต้องตอบกลับเท่านั้น:
{
  "summary_th": "สรุปกลยุทธ์ของทีม 1-3 ประโยค",
  "suggested_stack": ["..."],
  "weeks": [
    { "week": 1, "title_th": "...", "focus_th": "...", "tasks_th": ["..."], "milestone_th": "..." }
  ],
  "risks_th": ["..."]
}`;

  const userPrompt = [
    `ชื่อทีม: ${input.context.teamName}`,
    `การแข่งขัน: ${input.context.competitionTitle}`,
    `หมวดหมู่: ${input.context.category}`,
    `รายละเอียด: ${input.context.summary ?? "ไม่ระบุ"}`,
    `คุณสมบัติ: ${input.context.eligibility ?? "ไม่ระบุ"}`,
    `สแตกที่โจทย์แนะนำ: ${input.context.techStackHints.join(", ") || "ไม่ระบุ"}`,
    `บทบาทที่โจทย์ต้องการ: ${input.context.recommendedRoles.join(", ") || "ไม่ระบุ"}`,
    "สมาชิกและทักษะ:",
    ...input.context.members.map(
      (member) =>
        `- ${member.fullName}${member.nickname ? ` (${member.nickname})` : ""}: ${member.assignedRole} [${member.skills.join(", ") || "ไม่ระบุทักษะ"}]`,
    ),
    "งานที่มีอยู่แล้ว:",
    ...input.context.tasks.map(
      (task) => `- ${task.title} (${task.status}, ${task.due_date ?? "ไม่ระบุกำหนด"})`,
    ),
    "ผลงานที่ส่งลิงก์แล้ว:",
    ...input.context.deliverables.map(
      (item) => `- ${item.kind}: ${item.title}`,
    ),
  ].join("\n");

  const raw = await requestJsonCompletion(systemPrompt, userPrompt);
  return parseRoadmapOutput(raw, {
    weekCount: input.weekCount,
    todayIso: input.context.todayIso,
    deadline: input.context.deadline,
    generatedAt,
  });
}

export async function createRubricReviewPlan(input: {
  context: PrepTeamContext;
}): Promise<RubricReviewPlan> {
  const generatedAt = new Date().toISOString();
  const dateContext = getCurrentThaiDateContext();
  const systemPrompt = `คุณเป็นกรรมการตรวจผลงานการแข่งขันด้านเทคโนโลยีของโรงเรียนในประเทศไทย
ตอบกลับด้วย JSON เท่านั้น ห้ามมีข้อความหรือคำอธิบายนอก JSON ใช้ภาษาไทยที่สุภาพและระบุสิ่งที่ทำได้จริง

วันนี้: ${dateContext.thaiReadable} (พ.ศ. ${dateContext.beYear})

ให้คะแนน 5 ด้านตามคะแนนสูงสุดที่กำหนด รวมแล้วต้องไม่เกิน 100 คะแนน:
${RUBRIC_DIMENSIONS.map((item) => `- ${item.id} (${item.labelTh}): 0-${item.maxScore}`).join("\n")}

กติกา:
- ใส่ dimension_id ให้ครบทั้ง 5 ด้าน ไม่ซ้ำกัน
- evidence_th อธิบายสิ่งที่พบจากงานและลิงก์ที่มีจริง ห้ามเดาข้อมูลที่ไม่มีในบริบท
- improvement_th เป็นคำแนะนำเชิงปฏิบัติอย่างน้อย 1 ข้อต่อด้าน
- top_improvements_th มี 3-5 ข้อ เรียงตามความเร่งด่วน
- missing_items_th เป็นรายการสิ่งที่ยังไม่มีในงานจริง อาจเป็น array ว่าง
- ถ้าไม่มีลิงก์ผลงาน ให้คะแนนด้านความครบถ้วนและความพร้อมส่งต่ำลงตามความเหมาะสม

รูปแบบ JSON ที่ต้องตอบกลับเท่านั้น:
{
  "summary_th": "บทสรุปผลการตรวจ 1-3 ประโยค",
  "scores": [
    { "dimension_id": "problem_fit", "score": 0, "evidence_th": "...", "improvement_th": "..." }
  ],
  "top_improvements_th": ["..."],
  "missing_items_th": ["..."],
  "verdict_th": "ข้อสรุปว่าพร้อมส่งหรือต้องปรับอะไรก่อน"
}`;

  const readiness = calculateSubmissionReadiness({
    tasks: input.context.tasks,
    deliverables: input.context.deliverables,
    deadline: input.context.deadline,
    todayIso: input.context.todayIso,
  });
  const userPrompt = [
    `ชื่อทีม: ${input.context.teamName}`,
    `การแข่งขัน: ${input.context.competitionTitle}`,
    `หมวดหมู่: ${input.context.category}`,
    `กำหนดปิดรับ: ${input.context.deadline ?? "ไม่ระบุ"}`,
    `รายละเอียดโจทย์: ${input.context.summary ?? "ไม่ระบุ"}`,
    `คะแนนความพร้อมจากข้อมูลในระบบ: ${readiness.score}/100`,
    `งานที่เสร็จแล้ว: ${readiness.doneTasks}/${readiness.totalTasks}`,
    "ลิงก์ผลงานที่ส่งแล้ว:",
    ...input.context.deliverables.map(
      (item) => `- ${item.kind}: ${item.title} (${item.url})${item.note ? ` — ${item.note}` : ""}`,
    ),
    "งานในแผน:",
    ...input.context.tasks.map(
      (task) => `- ${task.title} (${task.status}, ${task.due_date ?? "ไม่ระบุกำหนด"})`,
    ),
  ].join("\n");

  const raw = await requestJsonCompletion(systemPrompt, userPrompt);
  return parseRubricReviewOutput(raw, { generatedAt });
}

interface TeamContextRow {
  id: string;
  name: string;
  status: string;
  competition_id: string;
  competition_title: string;
  category: string;
  deadline: string | null;
  summary: string | null;
  eligibility: string | null;
  tech_stack_hints: string[];
  recommended_roles: string[];
}

interface MemberRow {
  user_id: string;
  full_name: string;
  nickname: string | null;
  assigned_role: string;
  skills: string[];
}

interface DeliverableRow {
  id: string;
  team_id: string;
  title: string;
  kind: TeamDeliverable["kind"];
  url: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Loads team context under the caller's RLS identity. Teachers may inspect any
 * team; students must be members of a confirmed team.
 */
export async function loadPrepTeamContext(
  client: PoolClient,
  teamId: string,
): Promise<PrepTeamContext | null> {
  const teamRes = await client.query<TeamContextRow>(
    `SELECT t.id, t.name, t.status,
            c.id AS competition_id, c.title AS competition_title, c.category,
            c.deadline::text, c.summary, c.eligibility,
            c.tech_stack_hints, c.recommended_roles
     FROM public.teams t
     JOIN public.competitions c ON c.id = t.competition_id
     WHERE t.id = $1
       AND (public.is_confirmed_team_member(t.id) OR public.is_teacher())
     LIMIT 1`,
    [teamId],
  );
  const team = teamRes.rows[0];
  if (!team) return null;

  const memberRes = await client.query<MemberRow>(
    `SELECT tm.user_id, p.full_name, p.nickname, tm.assigned_role, p.skills
     FROM public.team_members tm
     JOIN public.profiles p ON p.id = tm.user_id
     WHERE tm.team_id = $1
     ORDER BY p.full_name ASC`,
    [teamId],
  );
  const taskRes = await client.query<TeamTaskSummary>(
    `SELECT id, title, status, due_date::text
     FROM public.team_tasks
     WHERE team_id = $1
     ORDER BY due_date ASC NULLS LAST, created_at ASC`,
    [teamId],
  );
  const deliverableRes = await client.query<DeliverableRow>(
    `SELECT id, team_id, title, kind, url, note, created_by,
            created_at::text, updated_at::text
     FROM public.team_deliverables
     WHERE team_id = $1
     ORDER BY created_at DESC, id DESC`,
    [teamId],
  );

  return {
    teamId: team.id,
    teamName: team.name,
    status: team.status,
    competitionId: team.competition_id,
    competitionTitle: team.competition_title,
    category: team.category,
    deadline: team.deadline,
    summary: team.summary,
    eligibility: team.eligibility,
    techStackHints: team.tech_stack_hints ?? [],
    recommendedRoles: team.recommended_roles ?? [],
    members: memberRes.rows.map((member) => ({
      userId: member.user_id,
      fullName: member.full_name,
      nickname: member.nickname,
      assignedRole: member.assigned_role,
      skills: member.skills ?? [],
    })),
    tasks: taskRes.rows.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      due_date: task.due_date,
    })),
    deliverables: deliverableRes.rows.map((item) => ({
      id: item.id,
      team_id: item.team_id,
      title: item.title,
      kind: item.kind,
      url: item.url,
      note: item.note,
      created_by: item.created_by,
      created_at: item.created_at,
      updated_at: item.updated_at,
    })),
    todayIso: getTodayIsoBangkok(),
  };
}

const planRowSchema = z.object({
  id: z.string().uuid(),
  input_hash: z.string(),
  plan: z.unknown(),
  created_at: z.string(),
  updated_at: z.string(),
});

function mapPlanRow(row: z.infer<typeof planRowSchema>): CachedPlanRecord {
  return {
    id: row.id,
    inputHash: row.input_hash,
    plan: row.plan,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findCachedPlan(
  client: PoolClient,
  input: { teamId: string; kind: PrepPlanKind; inputHash: string },
): Promise<CachedPlanRecord | null> {
  const result = await client.query(
    `SELECT id, input_hash, plan, created_at::text, updated_at::text
     FROM public.team_ai_plans
     WHERE team_id = $1 AND kind = $2 AND input_hash = $3
     LIMIT 1`,
    [input.teamId, input.kind, input.inputHash],
  );
  const parsed = planRowSchema.safeParse(result.rows[0]);
  return parsed.success ? mapPlanRow(parsed.data) : null;
}

export async function findLatestPlan(
  client: PoolClient,
  input: { teamId: string; kind: PrepPlanKind },
): Promise<CachedPlanRecord | null> {
  const result = await client.query(
    `SELECT id, input_hash, plan, created_at::text, updated_at::text
     FROM public.team_ai_plans
     WHERE team_id = $1 AND kind = $2
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [input.teamId, input.kind],
  );
  const parsed = planRowSchema.safeParse(result.rows[0]);
  return parsed.success ? mapPlanRow(parsed.data) : null;
}

export async function savePrepPlan(
  client: PoolClient,
  input: {
    teamId: string;
    kind: PrepPlanKind;
    inputHash: string;
    model: string;
    plan: PrepPlan;
    userId: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO public.team_ai_plans
       (team_id, kind, input_hash, model, plan, created_by, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, now())
     ON CONFLICT (team_id, kind, input_hash) DO UPDATE
     SET model = excluded.model,
         plan = excluded.plan,
         created_by = excluded.created_by,
         updated_at = now()`,
    [
      input.teamId,
      input.kind,
      input.inputHash,
      input.model,
      JSON.stringify(input.plan),
      input.userId,
    ],
  );
}
