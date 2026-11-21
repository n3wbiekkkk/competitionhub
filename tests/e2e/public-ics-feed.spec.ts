import { expect, test, type Page } from "@playwright/test";

const studentEmail = process.env.E2E_STUDENT_EMAIL ?? "student.e2e@example.test";
const studentPassword = process.env.E2E_STUDENT_PASSWORD ?? "e2e-student-pass";

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
