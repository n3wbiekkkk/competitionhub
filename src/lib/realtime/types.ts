import { z } from "zod";

export const riskLevelSchema = z.enum(["on_track", "at_risk", "blocked"]);
export type RiskLevel = z.infer<typeof riskLevelSchema>;

export const taskStatusSchema = z.enum(["todo", "doing", "done"]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const RISK_LABELS_TH: Record<RiskLevel, string> = {
  on_track: "ปกติ",
  at_risk: "เสี่ยง",
  blocked: "ติดปัญหา",
};

const metaSchema = z.object({
  id: z.string().min(1),
  at: z.string().datetime(),
});

export const realtimeEventSchema = z.discriminatedUnion("kind", [
  metaSchema.extend({ kind: z.literal("ready") }),
  metaSchema.extend({ kind: z.literal("heartbeat") }),
  z.object({
    kind: z.literal("notification"),
    id: z.string().min(1),
    userId: z.string().uuid(),
    title: z.string().min(1).max(200),
    body: z.string().max(500).nullable(),
    href: z.string().max(300).nullable(),
    createdAt: z.string().datetime(),
  }),
  z.object({
    kind: z.literal("team_message"),
    id: z.string().min(1),
    teamId: z.string().uuid(),
    authorId: z.string().uuid(),
    preview: z.string().max(180),
    createdAt: z.string().datetime(),
  }),
  z.object({
    kind: z.literal("team_task"),
    id: z.string().min(1),
    teamId: z.string().uuid(),
    taskId: z.string().uuid(),
    title: z.string().min(1).max(200),
    status: taskStatusSchema,
    createdAt: z.string().datetime(),
  }),
  z.object({
    kind: z.literal("team_checkin"),
    id: z.string().min(1),
    teamId: z.string().uuid(),
    checkinId: z.string().uuid(),
    riskLevel: riskLevelSchema,
    createdAt: z.string().datetime(),
  }),
]);

export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;

export interface MentionableMember {
  id: string;
  fullName: string;
  nickname: string | null;
}

export interface TeamMessageItem {
  id: string;
  teamId: string;
  authorId: string;
  authorName: string;
  nickname: string | null;
  body: string;
  mentions: string[];
  createdAt: string;
}

export interface TeamCheckinItem {
  id: string;
  teamId: string;
  authorId: string;
  authorName: string;
  nickname: string | null;
  weekStart: string;
  progress: string;
  blockers: string | null;
  nextSteps: string;
  riskLevel: RiskLevel;
  mentorNote: string | null;
  reviewedBy: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MentorCheckinItem extends TeamCheckinItem {
  teamName: string;
  competitionTitle: string;
}

export type LiveStatus = "connecting" | "live" | "polling" | "offline";
