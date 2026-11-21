import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const baseUrl = process.env.VISUAL_BASE_URL ?? "http://127.0.0.1:3000";
const outputDir = resolve(process.env.VISUAL_OUTPUT_DIR ?? ".visual-audit");
const viewports = [
  { name: "1920", width: 1920, height: 1080 },
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
];
const teacherEmail = process.env.E2E_TEACHER_EMAIL ?? "";
const teacherPassword = process.env.E2E_TEACHER_PASSWORD ?? "";

async function findCompetitionId() {
  const response = await fetch(`${baseUrl}/api/competitions?status=all`);
  if (!response.ok) return null;
  const body = await response.json();
  return body?.competitions?.[0]?.id ?? null;
}

async function login(page) {
  if (!teacherEmail || !teacherPassword) return false;
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("อีเมล").fill(teacherEmail);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(teacherPassword);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await page.waitForURL(`${baseUrl}/`, { timeout: 15_000 });
  return true;
}

const competitionId = await findCompetitionId();
const publicPaths = [
  "/",
  "/login",
  ...(competitionId ? [`/competitions/${competitionId}`] : []),
];
const privatePaths = [
  "/my-teams",
  "/people",
  "/profile",
  "/settings",
  "/teacher",
  "/teacher/review",
  "/teacher/reports",
  "/admin",
];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch();
const failures = [];
const geometry = [];
let checks = 0;

function fail(message) {
  failures.push(message);
}

async function isVisible(page, selector) {
  try {
    await page.locator(selector).first().waitFor({ state: "visible", timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

async function requireVisible(page, path, selector, label) {
  if (!(await isVisible(page, selector))) fail(`${path} missing ${label}`);
}

async function requireAny(page, path, selectors, label) {
  for (const selector of selectors) {
    if (await isVisible(page, selector)) return;
  }
  fail(`${path} missing ${label}`);
}

async function assertLayout(page, path, scheme, viewport) {
  if (viewport.width < 1440) return;
  if (path === "/") {
    await requireVisible(page, path, 'nav[aria-label="เมนูหลัก"]', "desktop sidebar nav");
    await requireVisible(page, path, 'button[aria-label="แสดงเป็นตาราง"]', "grid view toggle");
    await requireVisible(page, path, 'button[aria-label="แสดงเป็นรายการ"]', "list view toggle");
    await requireVisible(page, path, 'aside[class*="xl:sticky"][class*="top-24"]', "sticky filter rail");
    await requireVisible(page, path, '[class*="2xl:grid-cols-3"]', "3-column card grid");
  }
  if (path.startsWith("/competitions/")) {
    await requireVisible(page, path, '[class*="lg:col-span-8"]', "editorial main column");
    await requireVisible(page, path, '[class*="lg:col-span-4"]', "sticky action rail");
    await requireVisible(page, path, '[role="tablist"]', "detail tabs");
  }
  if (path === "/people") {
    await requireAny(
      page,
      path,
      [
        '[class*="2xl:grid-cols-4"]',
        'text=ยังไม่มีผู้คนที่เปิดเผยโปรไฟล์',
        'text=ไม่พบผู้คนที่ตรงกับคำค้นหา',
      ],
      "4-column people grid or empty state",
    );
  }
  if (path === "/teacher/review") {
    await requireAny(
      page,
      path,
      [
        '[class*="lg:grid-cols-12"]',
        'text=ไม่มีรายการแข่งขันในสถานะ',
        'text=ไม่พบรายการแข่งขันที่ตรงกับคำค้นหาในแท็บนี้',
      ],
      "master-detail review split or empty state",
    );
  }
  if (path === "/admin") {
    await requireVisible(page, path, '[class*="xl:grid-cols-4"]', "admin KPI bento");
    await requireVisible(page, path, '[class*="overflow-x-auto"]', "scrollable admin tabs or tables");
  }
  if (scheme === "light" && viewport.name === "1920" && path === "/") {
    const metrics = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="เมนูหลัก"]');
      const header = document.querySelector("header");
      const main = document.querySelector("main");
      return {
        sidebar: nav ? Math.round(nav.getBoundingClientRect().width) : 0,
        topbar: header ? Math.round(header.getBoundingClientRect().height) : 0,
        mainLeft: main ? Math.round(main.getBoundingClientRect().left) : 0,
      };
    });
    geometry.push({ scheme, viewport: viewport.name, ...metrics });
    if (metrics.sidebar < 220 || metrics.sidebar > 236) fail(`sidebar width ${metrics.sidebar}`);
    if (metrics.topbar < 56 || metrics.topbar > 64) fail(`topbar height ${metrics.topbar}`);
    if (metrics.mainLeft < 220) fail(`main left ${metrics.mainLeft}`);
  }
}

async function visitPaths(page, paths, scheme, viewport, auth) {
  for (const path of paths) {
    const response = await page.goto(`${baseUrl}${path}`, {
      waitUntil: "domcontentloaded",
    });
    const label = `${scheme} ${viewport.name} ${auth ? "auth" : "public"} ${path}`;
    if (!response?.ok()) {
      fail(`${label} HTTP ${response?.status() ?? "none"}`);
      continue;
    }
    const metrics = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bottomNav: Boolean(document.querySelector('nav[aria-label="เมนูด้านล่าง"]')),
    }));
    checks += 1;
    if (metrics.scrollWidth > metrics.innerWidth + 1) {
      fail(`${label} horizontal overflow ${metrics.scrollWidth}>${metrics.innerWidth}`);
    }
    if (viewport.width === 390 && path === "/" && !metrics.bottomNav) {
      fail(`${label} missing เมนูด้านล่าง`);
    }
    await assertLayout(page, path, scheme, viewport);
    const file = `${scheme}-${viewport.name}-${auth ? "auth-" : ""}${path === "/" ? "home" : path.replaceAll(/[^a-zA-Z0-9]+/g, "-")}.png`;
    await page.screenshot({ path: resolve(outputDir, file), fullPage: false });
  }
}

try {
  for (const scheme of ["light", "dark"]) {
    for (const viewport of viewports) {
      const publicContext = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: scheme,
        isMobile: viewport.width === 390,
        hasTouch: viewport.width === 390,
      });
      const publicPage = await publicContext.newPage();
      await visitPaths(publicPage, publicPaths, scheme, viewport, false);
      await publicContext.close();

      const authContext = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: scheme,
        isMobile: viewport.width === 390,
        hasTouch: viewport.width === 390,
      });
      const authPage = await authContext.newPage();
      const authenticated = await login(authPage);
      if (authenticated) {
        await visitPaths(authPage, privatePaths, scheme, viewport, true);
      } else {
        fail(`${scheme} ${viewport.name} teacher login unavailable`);
      }
      await authContext.close();
    }
  }
} finally {
  await browser.close();
}

for (const item of geometry) {
  console.log(
    `GEOMETRY ${item.scheme} ${item.viewport} sidebar=${item.sidebar} topbar=${item.topbar} mainLeft=${item.mainLeft}`,
  );
}

if (failures.length > 0) {
  console.error(`VISUAL AUDIT FAILED ${failures.length}/${checks}`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`VISUAL AUDIT PASS checks=${checks} screenshots=${outputDir}`);
}
