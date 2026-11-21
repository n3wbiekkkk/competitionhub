import { expect, test } from "@playwright/test";

const studentEmail = process.env.E2E_STUDENT_EMAIL ?? "student.e2e@example.test";
const studentPassword = process.env.E2E_STUDENT_PASSWORD ?? "e2e-student-pass";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("ฟีดและ Smart Add ใช้งานได้บนจอ 390×844 โดยไม่เลื่อนแนวนอน", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "การแข่งขันคอมพิวเตอร์และเทคโนโลยี" }),
  ).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(2);

  await page.goto("/login");
  await page.getByLabel("อีเมล").fill(studentEmail);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(studentPassword);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await page.waitForFunction(() => document.body.dataset.commandReady === "true");
  await expect(page.getByRole("navigation", { name: "เมนูด้านล่าง" })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/");
  await page.waitForFunction(() => document.body.dataset.commandReady === "true");
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: /คำสั่งด่วน/ });
  await expect(palette).toBeVisible();
  await palette.getByRole("textbox", { name: "ค้นหาคำสั่ง" }).fill("theme");
  await expect(palette.getByRole("option", { name: /theme/ }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
});

test("มีแถบนำทางด้านล่างสำหรับจอมือถือ", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => document.body.dataset.commandReady === "true");
  const bottomNav = page.getByRole("navigation", { name: "เมนูด้านล่าง" });
  await expect(bottomNav).toBeVisible();
  await expect(bottomNav.getByRole("link", { name: /รายการแข่งขัน/ })).toBeVisible();
  await expect(bottomNav.getByRole("link", { name: /ทีมของฉัน/ })).toBeVisible();
  await expect(bottomNav.getByRole("link", { name: /ผู้คน/ })).toBeVisible();
});

test("Command Palette เปิดด้วย Ctrl+K และค้นหาคำสั่งได้", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("อีเมล").fill(studentEmail);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(studentPassword);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "เมนูด้านล่าง" })).toBeVisible();
  await page.goto("/");
  await page.waitForFunction(() => document.body.dataset.commandReady === "true");
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: /คำสั่ง|Command/ });
  await expect(palette).toBeVisible();
  const search = palette.getByRole("textbox", { name: "ค้นหาคำสั่ง" });
  await expect(search).toBeVisible();
  await search.fill("theme");
  await expect(palette.getByRole("option", { name: /theme/ }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
});
