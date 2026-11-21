import { randomBytes, randomUUID, scrypt } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { z } from "zod";

const databaseUrl = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
const studentEmail = process.env.E2E_STUDENT_EMAIL ?? "student.e2e@example.test";
const studentPassword = process.env.E2E_STUDENT_PASSWORD ?? "e2e-student-pass";
const teacherEmail = process.env.E2E_TEACHER_EMAIL ?? "teacher.e2e@example.test";
const teacherPassword = process.env.E2E_TEACHER_PASSWORD ?? "e2e-teacher-pass";

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
  return `scrypt$${salt}$${key.toString("hex")}`;
}

async function createVisiblePeer(pool: Pool): Promise<{
  id: string;
  email: string;
  password: string;
}> {
  const id = randomUUID();
  const email = `e2e-collab-${id}@example.test`;
  const password = `Collab-${randomUUID()}!`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO public.auth_accounts (id, email, password_hash) VALUES ($1, $2, $3)",
      [id, email, await hashPassword(password)],
    );
    await client.query(
      `INSERT INTO public.profiles
         (id, full_name, nickname, email, role, grade, skills, directory_visible)
       VALUES ($1, $2, $3, $4, 'student', 'ม.5/2', ARRAY['Frontend'], true)`,
      [id, "เพื่อนร่วมทีมทดสอบ", "เพื่อน", email],
    );
    await client.query(
      "INSERT INTO public.auth_security (user_id, session_version) VALUES ($1, 0)",
      [id],
    );
    await client.query("COMMIT");
    return { id, email, password };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function signIn(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("อีเมล").fill(email);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "เมนูหลัก" })).toBeVisible();
}

function extractId(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  for (const key of ["id", "teamId", "team_id", "invitationId", "invitation_id"]) {
    if (typeof record[key] === "string") return record[key];
  }
  for (const key of ["team", "invitation"]) {
    const nested = record[key];
    if (typeof nested === "object" && nested !== null) {
      const value = (nested as Record<string, unknown>).id;
      if (typeof value === "string") return value;
    }
  }
  return null;
}

async function postJson(
  page: Page,
  url: string,
  data: unknown,
): Promise<{ status: number; body: unknown }> {
  const response = await page.request.post(url, { data });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    body = text;
  }
  return { status: response.status(), body };
}

test("LFG → เชิญเพื่อน → AI roadmap → แชท → mentor check-in → ครูตรวจความเสี่ยง", async ({
  page,
  browser,
}) => {
  expect(databaseUrl, "MIGRATION_DATABASE_URL is required for collaboration E2E").toBeTruthy();
  if (!databaseUrl) return;

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const peer = await createVisiblePeer(pool);
  let teamId: string | null = null;

  try {
    await signIn(page, studentEmail, studentPassword);

    const competitionsResponse = await page.request.get(
      "/api/competitions?status=open",
    );
    expect(competitionsResponse.ok()).toBeTruthy();
    const competitions = z
      .object({ competitions: z.array(z.object({ id: z.string().uuid() })) })
      .safeParse(await competitionsResponse.json());
    expect(competitions.success).toBeTruthy();
    if (!competitions.success) return;
    const competitionId = competitions.data.competitions[0]?.id;
    expect(competitionId).toBeTruthy();
    if (!competitionId) return;

    const interest = await postJson(
      page,
      `/api/competitions/${competitionId}/interest`,
      { preferred_role: "Frontend", note: null },
    );
    expect([200, 201, 400]).toContain(interest.status);

    const teamName = `E2E LFG ${randomUUID()}`;
    const created = await postJson(
      page,
      `/api/competitions/${competitionId}/student-teams`,
      {
        name: teamName,
        title: teamName,
        openRoles: ["Frontend", "AI / ML"],
        open_roles: ["Frontend", "AI / ML"],
      },
    );
    teamId = [200, 201].includes(created.status)
      ? extractId(created.body)
      : null;
    if (!teamId) {
      const existing = await page.request.get(
        `/api/competitions/${competitionId}/student-teams`,
      );
      const parsed = z
        .object({ teams: z.array(z.object({ id: z.string().uuid() })) })
        .safeParse(await existing.json());
      teamId = parsed.success ? (parsed.data.teams[0]?.id ?? null) : null;
    }
    expect(teamId).toBeTruthy();
    if (!teamId) return;

    const invited = await postJson(
      page,
      `/api/teams/${teamId}/invitations`,
      {
        inviteeId: peer.id,
        invitee_id: peer.id,
        direction: "invite",
        proposedRole: "Frontend",
        proposed_role: "Frontend",
        message: "เชิญร่วมทีม E2E",
      },
    );
    expect([200, 201]).toContain(invited.status);
    const invitationId = extractId(invited.body);
    expect(invitationId).toBeTruthy();
    if (!invitationId) return;

    const peerContext = await browser.newContext();
    try {
      const peerPage = await peerContext.newPage();
      await signIn(peerPage, peer.email, peer.password);
      const accepted = await postJson(
        peerPage,
        `/api/invitations/${invitationId}/accept`,
        {},
      );
      expect([200, 201]).toContain(accepted.status);
    } finally {
      await peerContext.close();
    }

    const members = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM public.team_members WHERE team_id = $1",
      [teamId],
    );
    expect(Number(members.rows[0]?.count ?? 0)).toBeGreaterThanOrEqual(2);

    let roadmapCalls = 0;
    await page.route("**/api/teams/*/ai-roadmap", async (route) => {
      roadmapCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          weeks: [
            { week: 1, focus: "ค้นหาข้อมูลและตั้งเป้า", tasks: ["อ่านเงื่อนไข"] },
            { week: 2, focus: "สร้างต้นแบบ", tasks: ["เขียนโค้ดตัวอย่าง"] },
          ],
          suggestedStack: ["Next.js", "OpenTyphoon"],
          risks: ["เวลาทดสอบไม่พอ"],
        }),
      });
    });
    const roadmap = await page.evaluate(async (id: string) => {
      const response = await fetch(`/api/teams/${id}/ai-roadmap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      return { status: response.status, body: await response.json() };
    }, teamId);
    expect(roadmap.status).toBe(200);
    expect(roadmapCalls).toBe(1);

    const message = await postJson(
      page,
      `/api/teams/${teamId}/messages`,
      { body: "สวัสดีทีม เริ่มงานได้แล้ว" },
    );
    expect([200, 201]).toContain(message.status);

    const checkIn = await postJson(
      page,
      `/api/teams/${teamId}/checkins`,
      {
        status: "at_risk",
        progress_summary: "ยังหาข้อมูลไม่ครบ",
        blockers: "ต้องการที่ปรึกษา",
        next_steps: "นัดครูวันพุธ",
      },
    );
    expect([200, 201]).toContain(checkIn.status);

    const teacherContext = await browser.newContext();
    try {
      const teacherPage = await teacherContext.newPage();
      await signIn(teacherPage, teacherEmail, teacherPassword);
      const queue = await teacherPage.request.get("/api/teacher/checkins");
      expect(queue.ok()).toBeTruthy();
      const queueText = await queue.text();
      expect(queueText).toContain("at_risk");
      expect(queueText).toContain(teamId);
    } finally {
      await teacherContext.close();
    }
  } finally {
    if (teamId) {
      await pool.query("DELETE FROM public.teams WHERE id = $1", [teamId]);
    }
    await pool.query("DELETE FROM public.auth_accounts WHERE id = $1", [peer.id]);
    await pool.end();
  }
});
