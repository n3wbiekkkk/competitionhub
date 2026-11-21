import { expect, test, type Page } from "@playwright/test";

const teacherEmail = process.env.E2E_TEACHER_EMAIL ?? "teacher.e2e@example.test";
const teacherPassword = process.env.E2E_TEACHER_PASSWORD ?? "e2e-teacher-pass";
const competitionTitle = process.env.E2E_COMPETITION_TITLE ?? "E2E Hackathon";

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("อีเมล").fill(teacherEmail);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(teacherPassword);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "เมนูหลัก" })).toContainText(
    "คิวตรวจรายการ",
  );
}

test("อาจารย์ตรวจรายการแข่งขันในคิวและเปิดรายการที่อนุมัติแล้ว", async ({
  page,
}) => {
  await signIn(page);

  await page
    .getByRole("navigation", { name: "เมนูหลัก" })
    .getByRole("link", { name: "คิวตรวจรายการ" })
    .click();
  await expect(page).toHaveURL(/\/teacher\/review/);
  await expect(
    page.getByRole("heading", {
      name: "คิวตรวจและจัดการรายการแข่งขันสาย Tech",
    }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: /รอตรวจสอบ/ })).toBeVisible();

  await page.getByRole("tab", { name: /เปิดรับสมัคร/ }).click();
  await page
    .getByRole("link", { name: competitionTitle, exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: competitionTitle, exact: true }),
  ).toBeVisible();
});
