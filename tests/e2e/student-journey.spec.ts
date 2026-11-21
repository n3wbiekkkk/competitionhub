import { expect, test, type Page } from "@playwright/test";

const studentEmail = process.env.E2E_STUDENT_EMAIL ?? "student.e2e@example.test";
const studentPassword = process.env.E2E_STUDENT_PASSWORD ?? "e2e-student-pass";
const competitionTitle = process.env.E2E_COMPETITION_TITLE ?? "E2E Hackathon";

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("อีเมล").fill(studentEmail);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(studentPassword);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page.getByRole("button", { name: /บัญชีของ/ })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
}

test("นักเรียนลงชื่อสนใจการแข่งขันและตรวจทีมของฉัน", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "การแข่งขันคอมพิวเตอร์และเทคโนโลยี" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "เข้าสู่ระบบเพื่อลงชื่อแข่ง" }).click();
  await expect(page).toHaveURL(/\/login/);

  await signIn(page);
  await expect(page.getByRole("navigation", { name: "เมนูหลัก" })).toContainText(
    "ทีมของฉัน",
  );

  await page.getByRole("button", { name: "การแจ้งเตือน" }).click();
  await expect(page.getByText("ยังไม่มีการแจ้งเตือน")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("link", { name: competitionTitle, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: competitionTitle, exact: true }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: /ลงชื่อสนใจแข่ง|แก้ไขการลงชื่อ/ })
    .first()
    .click();
  await expect(
    page.getByRole("dialog", { name: "ลงชื่อสนใจเข้าร่วมการแข่งขัน" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /ยืนยันลงชื่อสนใจแข่ง|บันทึกการแก้ไขความสนใจ/ })
    .click();
  await expect(
    page.getByRole("dialog", { name: "ลงชื่อสนใจเข้าร่วมการแข่งขัน" }),
  ).toBeHidden();

  await page.goto("/my-teams");
  await expect(
    page.getByRole("heading", { name: "รายการที่ลงชื่อและทีมของฉัน" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: competitionTitle, exact: true }),
  ).toBeVisible();
});
