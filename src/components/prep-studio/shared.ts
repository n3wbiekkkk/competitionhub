import { z } from "zod";
import { getDeadlineCountdown, type DeadlineCountdown } from "@/lib/utils/thai-date";

export const RUBRIC_DIMENSION_IDS = [
  "problem_fit",
  "technical_quality",
  "completeness",
  "presentation",
  "readiness",
] as const;
export type RubricDimensionId = (typeof RUBRIC_DIMENSION_IDS)[number];

export const RUBRIC_DIMENSIONS: ReadonlyArray<{
  id: RubricDimensionId;
  labelTh: string;
  maxScore: number;
}> = [
  { id: "problem_fit", labelTh: "ความตรงกับโจทย์", maxScore: 25 },
  { id: "technical_quality", labelTh: "คุณภาพเชิงเทคนิค", maxScore: 25 },
  { id: "completeness", labelTh: "ความครบถ้วนของผลงาน", maxScore: 20 },
  { id: "presentation", labelTh: "การนำเสนอและเอกสาร", maxScore: 15 },
  { id: "readiness", labelTh: "ความพร้อมส่งผลงาน", maxScore: 15 },
];

export const roadmapPlanSchema = z.object({
  version: z.literal(1),
  kind: z.literal("roadmap"),
  summaryTh: z.string(),
  suggestedStack: z.array(z.string()),
  weeks: z.array(
    z.object({
      week: z.number().int().min(1),
      labelTh: z.string(),
      focusTh: z.string(),
      dueDate: z.string().nullable(),
      tasksTh: z.array(z.string()),
      milestoneTh: z.string(),
    }),
  ),
  risksTh: z.array(z.string()),
  generatedAt: z.string(),
});
export type RoadmapPlan = z.infer<typeof roadmapPlanSchema>;

export const rubricPlanSchema = z.object({
  version: z.literal(1),
  kind: z.literal("rubric_review"),
  summaryTh: z.string(),
  totalScore: z.number().int().min(0).max(100),
  maxScore: z.literal(100),
  scores: z.array(
    z.object({
      dimensionId: z.enum(RUBRIC_DIMENSION_IDS),
      labelTh: z.string(),
      score: z.number().int().min(0),
      maxScore: z.number().int().min(1),
      evidenceTh: z.string(),
      improvementTh: z.string(),
    }),
  ),
  topImprovementsTh: z.array(z.string()),
  missingItemsTh: z.array(z.string()),
  verdictTh: z.string(),
  generatedAt: z.string(),
});
export type RubricReviewPlan = z.infer<typeof rubricPlanSchema>;

export const DELIVERABLE_KINDS = [
  "source_code",
  "prototype",
  "document",
  "demo_video",
  "other",
] as const;

export type DeliverableKind = (typeof DELIVERABLE_KINDS)[number];

export const DELIVERABLE_LABELS_TH: Record<DeliverableKind, string> = {
  source_code: "ซอร์สโค้ด",
  prototype: "ต้นแบบ / โปรโตไทป์",
  document: "เอกสารรายงาน",
  demo_video: "วิดีโอสาธิต",
  other: "อื่น ๆ",
};

export interface TeamTaskSummary {
  id: string;
  title: string;
  status: "todo" | "doing" | "done";
  due_date: string | null;
}

export interface TeamDeliverable {
  id: string;
  team_id: string;
  title: string;
  kind: DeliverableKind;
  url: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ReadinessLevel = "empty" | "building" | "near" | "ready";

export interface ReadinessChecklistItem {
  id: string;
  labelTh: string;
  done: boolean;
}

export interface SubmissionReadiness {
  score: number;
  level: ReadinessLevel;
  taskPoints: number;
  taskMaxPoints: number;
  deliverablePoints: number;
  deliverableMaxPoints: number;
  doneTasks: number;
  totalTasks: number;
  checklist: ReadinessChecklistItem[];
  countdown: DeadlineCountdown;
}

interface CalculateReadinessInput {
  tasks: TeamTaskSummary[];
  deliverables: TeamDeliverable[];
  deadline: string | null;
  todayIso?: string;
}

export interface DeliverablesPayload {
  teamId: string;
  competition: { title: string; deadline: string | null };
  tasks: TeamTaskSummary[];
  deliverables: TeamDeliverable[];
  readiness: SubmissionReadiness;
}

export interface PlanResponse<T> {
  plan: T | null;
  inputHash: string;
  stale: boolean;
  cached?: boolean;
}

export interface ImportResponse {
  imported: number;
  skipped: number;
  total: number;
}

const taskSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: z.enum(["todo", "doing", "done"]),
  due_date: z.string().nullable(),
});

const deliverableSchema = z.object({
  id: z.string().uuid(),
  team_id: z.string().uuid(),
  title: z.string(),
  kind: z.enum(DELIVERABLE_KINDS),
  url: z.string(),
  note: z.string().nullable(),
  created_by: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const countdownSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none"), daysRemaining: z.null(), label: z.string() }),
  z.object({ kind: z.literal("expired"), daysRemaining: z.number(), label: z.string() }),
  z.object({ kind: z.literal("today"), daysRemaining: z.literal(0), label: z.string() }),
  z.object({ kind: z.literal("urgent"), daysRemaining: z.number(), label: z.string() }),
  z.object({ kind: z.literal("upcoming"), daysRemaining: z.number(), label: z.string() }),
]);

const readinessSchema = z.object({
  score: z.number(),
  level: z.enum(["empty", "building", "near", "ready"]),
  taskPoints: z.number(),
  taskMaxPoints: z.number(),
  deliverablePoints: z.number(),
  deliverableMaxPoints: z.number(),
  doneTasks: z.number(),
  totalTasks: z.number(),
  checklist: z.array(
    z.object({ id: z.string(), labelTh: z.string(), done: z.boolean() }),
  ),
  countdown: countdownSchema,
});

export const deliverablesPayloadSchema = z.object({
  teamId: z.string().uuid(),
  competition: z.object({ title: z.string(), deadline: z.string().nullable() }),
  tasks: z.array(taskSchema),
  deliverables: z.array(deliverableSchema),
  readiness: readinessSchema,
});

export const deliverableResponseSchema = z.object({ deliverable: deliverableSchema });
export const roadmapResponseSchema = z.object({
  plan: roadmapPlanSchema.nullable(),
  inputHash: z.string(),
  stale: z.boolean(),
  cached: z.boolean().optional(),
});
export const reviewResponseSchema = z.object({
  plan: rubricPlanSchema.nullable(),
  inputHash: z.string(),
  stale: z.boolean(),
  cached: z.boolean().optional(),
});
export const importResponseSchema = z.object({
  imported: z.number(),
  skipped: z.number(),
  total: z.number(),
});
export const errorResponseSchema = z.object({ error: z.string() });

const REQUIRED_DELIVERABLE_POINTS: Record<"source_code" | "document" | "demo_video", number> = {
  source_code: 18,
  document: 16,
  demo_video: 16,
};

/**
 * Derives the Submission Readiness Meter from team tasks and submitted links.
 * The result is intentionally never stored: both inputs can change independently.
 */
export function calculateSubmissionReadiness({
  tasks,
  deliverables,
  deadline,
  todayIso,
}: CalculateReadinessInput): SubmissionReadiness {
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((task) => task.status === "done").length;
  const taskMaxPoints = 50;
  const taskPoints =
    totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * taskMaxPoints);

  const deliverableMaxPoints = 50;
  const kinds = new Set(deliverables.map((item) => item.kind));
  let deliverablePoints = 0;
  for (const [kind, points] of Object.entries(REQUIRED_DELIVERABLE_POINTS)) {
    if (kinds.has(kind as keyof typeof REQUIRED_DELIVERABLE_POINTS)) {
      deliverablePoints += points;
    }
  }

  const score = Math.min(100, taskPoints + deliverablePoints);
  const level: ReadinessLevel =
    score === 0
      ? "empty"
      : score < 50
        ? "building"
        : score < 80
          ? "near"
          : "ready";

  return {
    score,
    level,
    taskPoints,
    taskMaxPoints,
    deliverablePoints,
    deliverableMaxPoints,
    doneTasks,
    totalTasks,
    checklist: [
      {
        id: "tasks",
        labelTh:
          totalTasks === 0
            ? "ยังไม่มีงานในแผนการแข่งขัน"
            : `ทำงานในแผนเสร็จแล้ว ${doneTasks}/${totalTasks} รายการ`,
        done: totalTasks > 0 && doneTasks === totalTasks,
      },
      {
        id: "source_code",
        labelTh: "เพิ่มลิงก์ซอร์สโค้ด",
        done: kinds.has("source_code"),
      },
      {
        id: "document",
        labelTh: "เพิ่มลิงก์เอกสารรายงาน",
        done: kinds.has("document"),
      },
      {
        id: "demo_video",
        labelTh: "เพิ่มลิงก์วิดีโอสาธิต",
        done: kinds.has("demo_video"),
      },
    ],
    countdown: getDeadlineCountdown(deadline, todayIso),
  };
}
