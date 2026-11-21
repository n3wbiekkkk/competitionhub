import { expect, test, type Page } from "@playwright/test";

const teacherEmail = process.env.E2E_TEACHER_EMAIL ?? "teacher.e2e@example.test";
const teacherPassword = process.env.E2E_TEACHER_PASSWORD ?? "e2e-teacher-pass";
const studentEmail = process.env.E2E_STUDENT_EMAIL ?? "student.e2e@example.test";

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("อีเมล").fill(teacherEmail);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(teacherPassword);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "เมนูหลัก" })).toContainText(
    "ผู้ดูแลระบบ",
  );
}

test("ผู้ดูแลระบบค้นหาผู้ใช้และตรวจภาพรวมทีม", async ({ page }) => {
  await signIn(page);

  await page
    .getByRole("navigation", { name: "เมนูหลัก" })
    .getByRole("link", { name: "ผู้ดูแลระบบ" })
    .click();
  await expect(page).toHaveURL(/\/admin/);
  await expect(
    page.getByRole("heading", { name: "แดชบอร์ดผู้ดูแลระบบ" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: /จัดการผู้ใช้/ })).toBeVisible();

  await page
    .getByPlaceholder("ค้นหาชื่อ, อีเมล, ทักษะ หรือช่องทางติดต่อ...")
    .fill(studentEmail);
  await expect(page.getByText(studentEmail, { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: /ภาพรวมทีมแข่งขัน/ }).click();
  await expect(page.getByText("ยังไม่มีทีมในระบบ")).toBeVisible();
});
