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

async function findCompetitionId() {
  const response = await fetch(`${baseUrl}/api/competitions?status=all`);
  if (!response.ok) return null;
  const body = await response.json();
  return body?.competitions?.[0]?.id ?? null;
}

const competitionId = await findCompetitionId();
const paths = [
  "/",
  "/login",
  "/showcase",
  ...(competitionId ? [`/competitions/${competitionId}`] : []),
];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch();
const failures = [];
let checks = 0;

try {
  for (const scheme of ["light", "dark"]) {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: scheme,
        isMobile: viewport.width === 390,
        hasTouch: viewport.width === 390,
      });
      const page = await context.newPage();
      for (const path of paths) {
        const response = await page.goto(`${baseUrl}${path}`, {
          waitUntil: "domcontentloaded",
        });
        const label = `${scheme} ${viewport.name} ${path}`;
        if (!response?.ok()) {
          failures.push(`${label} HTTP ${response?.status() ?? "none"}`);
          continue;
        }
        const metrics = await page.evaluate(() => ({
          innerWidth: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          bottomNav: Boolean(
            document.querySelector('nav[aria-label="เมนูด้านล่าง"]'),
          ),
        }));
        checks += 1;
        if (metrics.scrollWidth > metrics.innerWidth + 1) {
          failures.push(
            `${label} horizontal overflow ${metrics.scrollWidth}>${metrics.innerWidth}`,
          );
        }
        if (viewport.width === 390 && path === "/" && !metrics.bottomNav) {
          failures.push(`${label} missing เมนูด้านล่าง`);
        }
        const file = `${scheme}-${viewport.name}-${path === "/" ? "home" : path.replaceAll(/[^a-zA-Z0-9]+/g, "-")}.png`;
        await page.screenshot({ path: resolve(outputDir, file), fullPage: false });
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(`VISUAL AUDIT FAILED ${failures.length}/${checks}`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`VISUAL AUDIT PASS checks=${checks} screenshots=${outputDir}`);
}
