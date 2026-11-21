import { existsSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const studentEmail = process.env.E2E_STUDENT_EMAIL ?? "student.e2e@example.test";
const studentPassword = process.env.E2E_STUDENT_PASSWORD ?? "e2e-student-pass";

const bottomNavComponent = path.join(
  process.cwd(),
  "src/components/layout/mobile-bottom-nav.tsx",
);
const commandDirectory = path.join(process.cwd(), "src/components/command");

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
  await expect(page.getByRole("navigation", { name: "เมนูหลัก" })).toBeVisible();

  await page.goto("/");
  await page
    .getByRole("button", { name: "เพิ่มรายการ", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "เพิ่มรายการแข่งสาย Tech" });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width ?? 0).toBeLessThanOrEqual(390);
});

test("มีแถบนำทางด้านล่างสำหรับจอมือถือ", async ({ page }) => {
  test.skip(
    !existsSync(bottomNavComponent),
    "Phase 14 mobile-bottom-nav.tsx ยังไม่ได้รวมเข้า repository",
  );

  await page.goto("/");
  const bottomNav = page.getByRole("navigation", { name: /นำทางหลัก|เมนูด้านล่าง/ });
  await expect(bottomNav).toBeVisible();
  await expect(bottomNav.getByRole("link", { name: /ฟีด|หน้าแรก/ })).toBeVisible();
  await expect(bottomNav.getByRole("link", { name: /ทีมของฉัน/ })).toBeVisible();
  await expect(bottomNav.getByRole("link", { name: /ผู้คน/ })).toBeVisible();
});

test("Command Palette เปิดด้วย Ctrl+K และค้นหาคำสั่งได้", async ({ page }) => {
  test.skip(
    !existsSync(commandDirectory),
    "Phase 14 command palette ยังไม่ได้รวมเข้า repository",
  );

  await page.goto("/");
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: /คำสั่ง|Command/ });
  await expect(palette).toBeVisible();
  const search = palette.getByRole("combobox").first();
  await expect(search).toBeVisible();
  await search.fill("Smart Add");
  await expect(palette.getByText(/Smart Add|เพิ่มรายการแข่ง/).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
});
