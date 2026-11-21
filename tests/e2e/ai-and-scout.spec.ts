import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { z } from "zod";

const teacherEmail = process.env.E2E_TEACHER_EMAIL ?? "teacher.e2e@example.test";
const teacherPassword = process.env.E2E_TEACHER_PASSWORD ?? "e2e-teacher-pass";
const studentEmail = process.env.E2E_STUDENT_EMAIL ?? "student.e2e@example.test";
const studentPassword = process.env.E2E_STUDENT_PASSWORD ?? "e2e-student-pass";

async function signIn(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("อีเมล").fill(email);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page.getByRole("button", { name: "เพิ่มรายการ", exact: true }).first()).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
}

test("AI สกัดข้อมูลจากข้อความและฟื้นคืนหลัง AI ขัดข้องชั่วคราว", async ({
  page,
}) => {
  await signIn(page, studentEmail, studentPassword);

  const extracted = {
    is_tech_related: true,
    rejection_reason: null,
    title: "E2E AI Cup",
    category: "AI & Data Science",
    deadline: "2027-12-31",
    min_size: 2,
    max_size: 4,
    recommended_roles: ["AI / ML", "Frontend"],
    tech_stack_hints: ["Next.js", "OpenTyphoon"],
    eligibility: "นักเรียนมัธยมศึกษาตอนปลาย",
    summary: "การแข่งขัน AI สำหรับนักเรียนที่ส่งโปรเจกต์จริง",
  };

  let calls = 0;
  await page.route("**/api/ai/extract", async (route) => {
    calls += 1;
    if (calls === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "บริการวิเคราะห์ไม่พร้อมชั่วคราว" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        extracted,
        sourceType: "ai_link",
        sourceUrl: null,
      }),
    });
  });

  await page.goto("/");
  await page
    .getByRole("button", { name: "เพิ่มรายการ", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("dialog", { name: "เพิ่มรายการแข่งสาย Tech" }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "วางข้อความ" }).click();
  await page
    .locator("#smart-text")
    .fill("งานแข่ง AI E2E AI Cup ใช้ Next.js ทีม 2-4 คน ปิดรับสมัคร 31 ธันวาคม 2570");
  await page.getByRole("button", { name: "สกัดข้อมูลจากข้อความ" }).click();
  await expect(page.getByText("ไม่สามารถวิเคราะห์ข้อมูลได้")).toBeVisible();

  await page.getByRole("button", { name: "สกัดข้อมูลจากข้อความ" }).click();
  await expect(page.locator("#comp-title")).toHaveValue(extracted.title);
  await expect(page.locator("#comp-deadline")).toHaveValue(extracted.deadline);
  await expect(page.locator("#comp-title")).toBeEnabled();
  expect(calls).toBe(2);
});

test("Auto Scout แสดงการ suppressing รายการซ้ำจากสถิติที่ได้รับ", async ({
  page,
}) => {
  await signIn(page, teacherEmail, teacherPassword);

  const summary = {
    today: new Date().toISOString().slice(0, 10),
    closedExpiredCount: 0,
    discoveredCandidates: 3,
    processedCount: 1,
    insertedCount: 0,
    inserted: [],
    ignored: [],
    errors: [],
  };
  const events = [
    {
      type: "start",
      today: summary.today,
      sources: [{ id: "hackza", name: "Hackza Thailand", target: "https://www.hackza.org/hackathons" }],
    },
    {
      type: "dedup_done",
      discoveredCandidates: 3,
      alreadyInDb: 2,
      toProcess: 1,
    },
    {
      type: "candidate_result",
      index: 1,
      total: 1,
      url: "https://example.test/e2e-duplicate",
      sourceName: "Hackza Thailand",
      outcome: "duplicate",
      title: "รายการที่เคยบันทึกแล้ว",
      reason: "ลิงก์นี้มีอยู่ในระบบแล้ว",
    },
    { type: "complete", summary },
  ];

  await page.route("**/api/teacher/scout**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
    });
  });

  await page.goto("/teacher/review");
  await page.getByRole("button", { name: "รัน AI ค้นหาในไทย" }).click();
  await expect(
    page.getByRole("dialog", {
      name: "AI Tech Scout — ติดตามการทำงานแบบเรียลไทม์",
    }),
  ).toBeVisible();

  await expect(page.getByText("ซ้ำในระบบ", { exact: true })).toBeVisible();
  await expect(page.getByText("ลิงก์นี้มีอยู่ในระบบแล้ว")).toBeVisible();
  await expect(page.getByText("พบทั้งหมด")).toBeVisible();
});

test("Rubric review รับผล AI ที่ Zod ตรวจแล้วและฟื้นคืนหลัง timeout", async ({
  page,
}) => {
  await signIn(page, studentEmail, studentPassword);

  const competitionsResponse = await page.request.get(
    "/api/competitions?status=open",
  );
  expect(competitionsResponse.ok()).toBeTruthy();
  const competitionsBody = z
    .object({ competitions: z.array(z.object({ id: z.string().uuid() })) })
    .safeParse(await competitionsResponse.json());
  expect(competitionsBody.success).toBeTruthy();
  if (!competitionsBody.success) return;

  const competitionId = competitionsBody.data.competitions[0]?.id;
  expect(competitionId).toBeTruthy();
  if (!competitionId) return;

  const interestResponse = await page.request.post(
    `/api/competitions/${competitionId}/interest`,
    { data: { preferred_role: "Frontend", note: null } },
  );
  expect([200, 201]).toContain(interestResponse.status());

  const teamName = `E2E Rubric ${randomUUID()}`;
  const createResponse = await page.request.post(
    `/api/competitions/${competitionId}/student-teams`,
    {
      data: {
        name: teamName,
        title: teamName,
        openRoles: [],
        open_roles: [],
      },
    },
  );
  expect(createResponse.ok()).toBeTruthy();
  const teamBody: unknown = await createResponse.json();
  const teamId = extractTeamId(teamBody);
  expect(teamId).toBeTruthy();
  if (!teamId) return;

  let calls = 0;
  await page.route("**/api/teams/*/ai-review", async (route) => {
    calls += 1;
    if (calls === 1) {
      await route.fulfill({ status: 504, body: "AI timeout" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        scores: {
          problem_fit: 4,
          technical_feasibility: 3,
          innovation: 4,
          presentation_clarity: 3,
        },
        suggestions: ["ควรอธิบายความเสี่ยงของข้อมูลให้ชัดเจนขึ้น"],
        follow_up_questions: ["จะวัดผลลัพธ์ของโมเดลอย่างไร?"],
      }),
    });
  });

  const submission = {
    abstract: "ระบบแนะนำการแข่งขันด้วย AI สำหรับนักเรียนไทย",
    problem_statement: "นักเรียนหาการแข่งขันที่ตรงทักษะไม่เจอ",
  };

  const first = await callReview(page, teamId, submission);
  expect(first.status).toBe(504);

  const second = await callReview(page, teamId, submission);
  expect(second.status).toBe(200);
  const reviewSchema = z.object({
    scores: z.record(z.string(), z.number()),
    suggestions: z.array(z.string()),
  });
  const review = reviewSchema.safeParse(second.body);
  expect(review.success).toBeTruthy();
  if (review.success) {
    expect(Object.keys(review.data.scores).length).toBeGreaterThanOrEqual(4);
    expect(review.data.suggestions.length).toBeGreaterThan(0);
  }
  expect(calls).toBe(2);
});

function extractTeamId(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  for (const key of ["id", "teamId", "team_id"]) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  const nested = record.team;
  if (typeof nested === "object" && nested !== null) {
    const team = nested as Record<string, unknown>;
    if (typeof team.id === "string") return team.id;
  }
  return null;
}

async function callReview(
  page: Page,
  teamId: string,
  submission: { abstract: string; problem_statement: string },
): Promise<{ status: number; body: unknown }> {
  return page.evaluate(
    async ({ id, payload }) => {
      const response = await fetch(`/api/teams/${id}/ai-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await response.text();
      let body: unknown = null;
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = text;
      }
      return { status: response.status, body };
    },
    { id: teamId, payload: submission },
  );
}
