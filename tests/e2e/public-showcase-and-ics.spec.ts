import { randomBytes, randomUUID, scrypt } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

const databaseUrl = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
const teacherEmail = process.env.E2E_TEACHER_EMAIL ?? "teacher.e2e@example.test";
const studentEmail = process.env.E2E_STUDENT_EMAIL ?? "student.e2e@example.test";
const studentPassword = process.env.E2E_STUDENT_PASSWORD ?? "e2e-student-pass";

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

async function seedShowcaseResults(pool: Pool): Promise<{
  competitionId: string;
  userId: string;
  privateName: string;
  privateEmail: string;
  publicTitle: string;
  privateTitle: string;
}> {
  const teacher = await pool.query<{ id: string }>(
    "SELECT id FROM public.auth_accounts WHERE lower(email) = lower($1) LIMIT 1",
    [teacherEmail],
  );
  const teacherId = teacher.rows[0]?.id;
  expect(teacherId).toBeTruthy();
  if (!teacherId) throw new Error("ไม่พบอาจารย์สำหรับการทดสอบ showcase");

  const suffix = randomUUID();
  const userId = randomUUID();
  const privateName = `PrivateStudent-DO-NOT-PUBLISH-${suffix}`;
  const privateEmail = `e2e-private-${suffix}@example.test`;
  const publicTitle = `E2E Public Award ${suffix}`;
  const privateTitle = `E2E Private Award ${suffix}`;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const competition = await client.query<{ id: string }>(
      `INSERT INTO public.competitions
         (title, category, deadline, min_size, max_size, summary, source_url, source_type, status)
       VALUES ($1, 'Programming / Competitive', (current_date + interval '30 days')::date,
               1, 4, $2, $3, 'manual', 'open')
       RETURNING id`,
      [
        `E2E Showcase ${suffix}`,
        "การแข่งขันสำหรับทดสอบหน้า showcase",
        `https://example.test/e2e-showcase-${suffix}`,
      ],
    );
    const competitionId = competition.rows[0]?.id;
    if (!competitionId) throw new Error("ไม่สามารถสร้าง competition สำหรับทดสอบ");

    await client.query(
      `INSERT INTO public.auth_accounts (id, email, password_hash) VALUES ($1, $2, $3)`,
      [userId, privateEmail, await hashPassword(`Private-${suffix}!`)],
    );
    await client.query(
      `INSERT INTO public.profiles
         (id, full_name, nickname, email, role, grade, directory_visible)
       VALUES ($1, $2, 'ส่วนตัว', $3, 'student', 'ม.5/1', false)`,
      [userId, privateName, privateEmail],
    );
    await client.query(
      "INSERT INTO public.auth_security (user_id, session_version) VALUES ($1, 0)",
      [userId],
    );

    const team = await client.query<{ id: string }>(
      `INSERT INTO public.teams (competition_id, name, advisor_id, status, is_public_showcase)
       VALUES ($1, $2, $3, 'confirmed', true) RETURNING id`,
      [competitionId, `E2E Showcase Team ${suffix}`, teacherId],
    );
    const teamId = team.rows[0]?.id;
    if (!teamId) throw new Error("ไม่สามารถสร้าง team สำหรับทดสอบ");

    await client.query(
      `INSERT INTO public.team_members (team_id, user_id, assigned_role)
       VALUES ($1, $2, 'Frontend')`,
      [teamId, userId],
    );
    await client.query(
      `INSERT INTO public.competition_results
         (competition_id, team_id, award_title, rank_tier, verified_by, is_public_showcase)
       VALUES ($1, $2, $3, 'รางวัลที่ 1', $4, true)`,
      [competitionId, teamId, publicTitle, teacherId],
    );
    await client.query(
      `INSERT INTO public.competition_results
         (competition_id, team_id, award_title, rank_tier, verified_by, is_public_showcase)
       VALUES ($1, $2, $3, 'รางวัลชมเชย', $4, false)`,
      [competitionId, teamId, privateTitle, teacherId],
    );
    await client.query("COMMIT");

    return {
      competitionId,
      userId,
      privateName,
      privateEmail,
      publicTitle,
      privateTitle,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("อีเมล").fill(studentEmail);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(studentPassword);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page.getByRole("button", { name: /บัญชีของ/ })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
}

function tokenFromBody(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.token === "string") return record.token;
  const nested = record.calendar ?? record.feed;
  if (typeof nested === "object" && nested !== null) {
    const value = (nested as Record<string, unknown>).token;
    if (typeof value === "string") return value;
  }
  return null;
}

test("showcase เฉพาะผลงานที่ opt-in และไม่เปิดเผยข้อมูลส่วนตัว", async ({
  browser,
}) => {
  expect(databaseUrl, "MIGRATION_DATABASE_URL is required for showcase E2E").toBeTruthy();
  if (!databaseUrl) return;

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const fixture = await seedShowcaseResults(pool);
  const context = await browser.newContext();

  try {
    const page = await context.newPage();
    const response = await page.goto("/showcase");
    expect(response?.status()).toBe(200);
    await expect(page.getByText(fixture.publicTitle)).toBeVisible();
    await expect(page.getByText(fixture.privateTitle)).toHaveCount(0);
    await expect(page.getByText(fixture.privateName)).toHaveCount(0);
    await expect(page.getByText(fixture.privateEmail)).toHaveCount(0);
  } finally {
    await context.close();
    await pool.query("DELETE FROM public.competitions WHERE id = $1", [
      fixture.competitionId,
    ]);
    await pool.query("DELETE FROM public.auth_accounts WHERE id = $1", [
      fixture.userId,
    ]);
    await pool.end();
  }
});

test("ฟีด .ics ใช้โทเค็นและหยุดทำงานทันทีหลังเพิกถอน", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings");
  await expect(page.getByText(/webcal|Calendar|ปฏิทิน/i).first()).toBeVisible();

  const created = await page.request.post("/api/calendar/token");
  expect(created.ok()).toBeTruthy();
  const token = tokenFromBody(await created.json());
  expect(token).toBeTruthy();
  if (!token) return;

  const feed = await page.request.get(`/api/calendar/feed/${token}.ics`);
  expect(feed.status()).toBe(200);
  const calendar = await feed.text();
  expect(calendar).toContain("BEGIN:VCALENDAR");
  expect(calendar).toContain("END:VCALENDAR");

  const revoked = await page.request.delete("/api/calendar/token");
  expect(revoked.ok()).toBeTruthy();

  const afterRevoke = await page.request.get(
    `/api/calendar/feed/${token}.ics`,
  );
  expect(afterRevoke.status()).toBeGreaterThanOrEqual(400);
  expect(await afterRevoke.text()).not.toContain("BEGIN:VCALENDAR");
});
