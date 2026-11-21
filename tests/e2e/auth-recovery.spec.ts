import { randomBytes, randomUUID, scrypt } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { z } from "zod";

const databaseUrl = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
const appUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

const outboxPayloadSchema = z.object({
  subject: z.string().optional(),
  text: z.string(),
  html: z.string().optional(),
});

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

async function createRecoveryUser(pool: Pool): Promise<{
  id: string;
  email: string;
  password: string;
}> {
  const id = randomUUID();
  const email = `e2e-recovery-${id}@example.test`;
  const password = `Recovery-${randomUUID()}!`;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO public.auth_accounts (id, email, password_hash)
       VALUES ($1, $2, $3)`,
      [id, email, await hashPassword(password)],
    );
    await client.query(
      `INSERT INTO public.profiles
         (id, full_name, nickname, email, role, grade, directory_visible)
       VALUES ($1, $2, $3, $4, 'student', 'ม.5/1', false)`,
      [id, "นักเรียนกู้คืนบัญชี", "ทดสอบ", email],
    );
    await client.query(
      `INSERT INTO public.auth_security (user_id, session_version)
       VALUES ($1, 0)`,
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

function tokenFromOutboxText(text: string): string | null {
  const match = /https?:\/\/[^\s"'<>]+[?&]token=([A-Za-z0-9_-]+)/.exec(text);
  return match?.[1] ?? null;
}

async function readOutboxToken(pool: Pool, email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await pool.query<{ payload: unknown }>(
      `SELECT payload FROM public.email_outbox
       WHERE to_email = $1 AND template = 'password_reset'
       ORDER BY created_at DESC LIMIT 1`,
      [email],
    );
    const parsed = outboxPayloadSchema.safeParse(result.rows[0]?.payload);
    if (parsed.success) {
      const token = tokenFromOutboxText(parsed.data.text);
      if (token) return token;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("ไม่พบโทเค็นรีเซ็ตรหัสผ่านใน email_outbox");
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("อีเมล").fill(email);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "เมนูหลัก" })).toBeVisible();
}

test("กู้คืนรหัสผ่านจากโทเค็นใน email_outbox แล้วเพิกถอนเซสชันเก่า", async ({
  page,
  browser,
}) => {
  expect(databaseUrl, "MIGRATION_DATABASE_URL is required for recovery E2E").toBeTruthy();
  if (!databaseUrl) return;

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const user = await createRecoveryUser(pool);
  const nextPassword = `Recovered-${randomUUID()}!`;
  let sessionToken: string | undefined;

  try {
    await page.goto("/forgot-password");
    await page.getByLabel("อีเมล").fill(user.email);
    await page.getByRole("button", { name: "ส่งลิงก์รีเซ็ตรหัสผ่าน" }).click();
    await expect(page.getByRole("status")).toContainText("หากอีเมลนี้มีบัญชีในระบบ");

    const token = await readOutboxToken(pool, user.email);
    expect(token.length).toBeGreaterThan(20);

    await page.goto(`/reset-password?token=${token}`);
    await page.getByLabel("รหัสผ่านใหม่").fill(nextPassword);
    await page.getByLabel("ยืนยันรหัสผ่านใหม่").fill(nextPassword);
    await page.getByRole("button", { name: "ตั้งรหัสผ่านใหม่" }).click();
    await expect(page).toHaveURL(/\/login/);

    const replay = await page.request.post("/api/auth/reset-password", {
      data: { token, password: `Another-${randomUUID()}!` },
    });
    expect(replay.status()).toBe(400);

    await signIn(page, user.email, nextPassword);
    const cookies = await page.context().cookies();
    sessionToken = cookies.find((cookie) => cookie.name === "techhub_session")?.value;
    expect(sessionToken).toBeTruthy();

    const secondContext = await browser.newContext();
    try {
      await secondContext.addCookies([
        {
          name: "techhub_session",
          value: sessionToken ?? "",
          url: appUrl,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      const secondPage = await secondContext.newPage();
      const beforeRevoke = await secondPage.goto("/api/profile");
      expect(beforeRevoke?.status()).toBe(200);

      await page.goto("/settings");
      await page.getByRole("button", { name: "ออกจากทุกอุปกรณ์" }).click();
      await expect(page).toHaveURL(/\/login/);

      const afterRevoke = await secondContext.request.get("/api/profile");
      expect(afterRevoke.status()).toBe(401);
    } finally {
      await secondContext.close();
    }
  } finally {
    await pool.query("DELETE FROM public.auth_accounts WHERE id = $1", [user.id]);
    await pool.query("DELETE FROM public.email_outbox WHERE to_email = $1", [
      user.email,
    ]);
    await pool.end();
  }
});
