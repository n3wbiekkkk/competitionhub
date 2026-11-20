#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;

function loadEnvLocalIfPresent() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnvLocalIfPresent();

const TECH_CATEGORIES = [
  "Programming / Competitive",
  "AI & Data Science",
  "Web & Mobile Dev",
  "Cybersecurity / CTF",
  "Robotics & IoT",
  "Game Dev",
  "Tech Hackathon & Innovation",
  "UI/UX & Digital Design",
];

const TECH_ROLES = [
  "Frontend",
  "Backend",
  "Full-Stack",
  "Mobile Dev",
  "AI / ML",
  "Data Science",
  "Cybersecurity",
  "Embedded / IoT",
  "Robotics",
  "Game Dev",
  "UI/UX Design",
  "Algorithm / CP",
  "Pitching & PM",
];

const THAI_MONTHS_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

const THAI_MONTHS_FULL = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

function getTodayIsoBangkok() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

function normalizeIsoDate(raw) {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  let y = 0;
  let m = 0;
  let d = 0;
  if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else {
    const thai = /^(\d{1,2})\s+([^\s\d]+)\s+(\d{4})$/.exec(trimmed);
    if (!thai) return null;
    d = Number(thai[1]);
    const token = thai[2].trim();
    y = Number(thai[3]);
    const fi = THAI_MONTHS_FULL.indexOf(token);
    const si = THAI_MONTHS_SHORT.indexOf(token);
    m = fi !== -1 ? fi + 1 : si !== -1 ? si + 1 : 0;
  }
  if (y >= 2400) y -= 543;
  if (y < 2020 || y > 2035 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const utc = new Date(Date.UTC(y, m - 1, d));
  if (
    utc.getUTCFullYear() !== y ||
    utc.getUTCMonth() !== m - 1 ||
    utc.getUTCDate() !== d
  ) {
    return null;
  }
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function coerceCategory(raw, hint = "") {
  const trimmed = String(raw || "").trim();
  const exact = TECH_CATEGORIES.find(
    (c) => c.toLowerCase() === trimmed.toLowerCase(),
  );
  if (exact) return exact;
  const combined = `${trimmed} ${hint}`.toLowerCase();
  if (combined.includes("cyber") || combined.includes("ctf")) {
    return "Cybersecurity / CTF";
  }
  if (
    combined.includes("robot") ||
    combined.includes("iot") ||
    combined.includes("embedded") ||
    combined.includes("arduino")
  ) {
    return "Robotics & IoT";
  }
  if (combined.includes("game")) return "Game Dev";
  if (
    combined.includes("ui/ux") ||
    combined.includes("ux/ui") ||
    combined.includes("design")
  ) {
    return "UI/UX & Digital Design";
  }
  if (
    combined.includes("programming") ||
    combined.includes("competitive") ||
    combined.includes("coding")
  ) {
    return "Programming / Competitive";
  }
  if (combined.includes("web") || combined.includes("mobile")) {
    return "Web & Mobile Dev";
  }
  if (combined.includes("ai") || combined.includes("data") || combined.includes("ml")) {
    return "AI & Data Science";
  }
  return "Tech Hackathon & Innovation";
}

function coerceRoles(rawRoles) {
  if (!Array.isArray(rawRoles)) return ["Full-Stack"];
  const out = [];
  for (const r of rawRoles) {
    const t = String(r || "").trim();
    const matched = TECH_ROLES.find(
      (role) => role.toLowerCase() === t.toLowerCase(),
    );
    if (matched && !out.includes(matched)) out.push(matched);
  }
  return out.length > 0 ? out.slice(0, 5) : ["Full-Stack"];
}

function normalizeTitleKey(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9ก-๙]+/g, "")
    .trim();
}

async function fetchTextSafe(url, timeoutMs = 15000) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchJsonSafe(url, timeoutMs = 12000) {
  const txt = await fetchTextSafe(url, timeoutMs);
  if (!txt) return null;
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

/**
 * 1) Hackza Thailand — curated open & iconic 2026 Thailand tech competitions ONLY
 *    (explicitly excludes foreign global Devpost/Meta/Amazon mirrors listed on Hackza)
 */
const HACKZA_FOREIGN_EXCLUDES = [
  "paypal-and-ai-glob",
  "nebius-x-nvidia",
  "amazon-developer-hackat",
  "meta-vr-start-developer",
  "asean-futures-hackathon",
  "asean-digital-awards",
  "global-student-entrepreneur",
  "kgi-algo-trading-bootcamp-competition-20-a7a3k",
  "ai-for-all-hackathon-39fmb",
];

const HACKZA_PRIORITY_CLOSED_SLUGS = new Set([
  "spu-ai-hackathon-2026-ai-48-p7ba0",
  "bangmod-hackathon-2026-8wa7z",
  "ai-for-all-hackathon-dfmwh",
  "ai-hackathon-thailand-2026-finance-data-phf3n",
  "hri-hackathon-thailand-2026-ejx03",
  "dictionary-reimagined-hackathon-c4prz",
  "ntt-data-digital-innovation-challenge-20-kuxgc",
  "sea-x-openai-regional-codex-hackathon-th-a7usn",
  "spark-hack-season-2-as8nk",
  "bjm-hackathon-2026-ai-human-make-it-real-wug3l",
  "thai-traditional-medicine-digital-health-os5kl",
  "korat-wellbeing-hack-2026-vy3l4",
]);

async function gatherHackzaThailand() {
  const md = await fetchTextSafe(
    "https://r.jina.ai/https://www.hackza.org/hackathons",
    16000,
  );
  if (!md) return [];

  const openItems = [];
  const closedItems = [];
  const seen = new Set();
  const regex =
    /### \[([^\]]+)\]\((https:\/\/www\.hackza\.org\/hackathons\/([a-z0-9-]+))\)/gi;

  for (const m of md.matchAll(regex)) {
    const title = m[1]?.trim() ?? "";
    const url = m[2]?.trim() ?? "";
    const slug = (m[3] ?? "").toLowerCase();
    if (!url || seen.has(url)) continue;
    if (HACKZA_FOREIGN_EXCLUDES.some((ex) => slug.includes(ex))) continue;
    seen.add(url);

    const start = Math.max(0, (m.index ?? 0) - 220);
    const end = Math.min(md.length, (m.index ?? 0) + 340);
    const snippet = md.slice(start, end);
    const isClosed = snippet.includes("ปิดรับสมัครแล้ว");

    const item = {
      url,
      sourceName: "Hackza Thailand",
      allowClosed: isClosed,
      hintText: `ชื่อรายการ: ${title}\nข้อมูลจาก Hackza Thailand:\n${snippet}`,
    };

    if (!isClosed) {
      openItems.push(item);
    } else if (HACKZA_PRIORITY_CLOSED_SLUGS.has(slug)) {
      closedItems.push(item);
    }
  }

  return [...openItems, ...closedItems];
}

/**
 * 2) PorTCAS Thailand — high school & university tech contests
 */
async function gatherPortcasThailand() {
  const html = await fetchTextSafe("https://www.portcas.com/competition", 12000);
  const curatedSlugs = [
    "siitec-hackathon-2569",
    "coding-yrc-contest-2026",
    "ict-challenge-2026-sit-kmutt",
    "ahs-innovation-pitching-2027",
  ];

  const discovered = new Set(curatedSlugs);
  if (html) {
    for (const m of html.matchAll(/\/competition\/([a-z0-9-]+)/gi)) {
      const slug = m[1].toLowerCase();
      if (
        slug !== "cover" &&
        slug !== "slider-prev" &&
        slug !== "slider-next" &&
        slug !== "build-something-different-hackathon" &&
        slug !== "bjm-mediax-ai-innovation-hackathon-2026"
      ) {
        discovered.add(slug);
      }
    }
  }

  return Array.from(discovered).map((slug) => ({
    url: `https://www.portcas.com/competition/${slug}`,
    sourceName: "PorTCAS Thailand",
    allowClosed: true,
    hintText: `URL: https://www.portcas.com/competition/${slug}`,
  }));
}

/**
 * 3) Contester.Life Thailand — tech & startup innovation contests
 */
async function gatherContesterThailand() {
  const md = await fetchTextSafe("https://r.jina.ai/https://contester.life/", 14000);
  const curatedSlugs = new Set([
    "startup-thailand-league-2027",
    "fcc-hackathon",
  ]);

  const snippets = new Map();
  if (md) {
    const regex = /###\s+([^\n]+?)\]\((https:\/\/contester\.life\/contest\/([a-z0-9-]+))\)/gi;
    for (const m of md.matchAll(regex)) {
      const slug = m[3]?.toLowerCase();
      if (!slug || slug === "submit") continue;
      if (curatedSlugs.has(slug)) {
        snippets.set(slug, m[1].replace(/\s+/g, " ").trim());
      }
    }
  }

  return Array.from(curatedSlugs).map((slug) => ({
    url: `https://contester.life/contest/${slug}`,
    sourceName: "Contester Thailand",
    allowClosed: false,
    hintText: snippets.get(slug)
      ? `ข้อมูลจาก Contester Thailand: ${snippets.get(slug)}`
      : `รายการแข่งขันในไทยบน Contester.Life: ${slug}`,
  }));
}

/**
 * 4) CTF Thailand — Thailand Cybersecurity / CTF contests (excluding duplicates & non-contest news)
 */
async function gatherCtfThailand() {
  const posts = await fetchJsonSafe(
    "https://ctf.in.th/wp-json/wp/v2/posts?per_page=20",
  );
  if (!Array.isArray(posts)) return [];

  const items = [];
  for (const post of posts) {
    const title = stripHtml(post.title?.rendered);
    const url = post.link;
    if (!url || !title) continue;
    if (!url.includes("/challenge/")) continue;
    if (
      title.includes("ประกาศผล") ||
      title.includes("ผลการแข่งขัน") ||
      title.includes("Women Thailand Cyber Top Talent 2026")
    ) {
      continue;
    }

    items.push({
      url,
      sourceName: "CTF Thailand",
      allowClosed: true,
      hintText: [
        `ชื่อรายการ: ${title}`,
        `ผู้จัด/แหล่งข่าว: CTF Thailand (ประเทศไทย)`,
        `วันที่เผยแพร่: ${post.date ?? ""}`,
        `สรุป: ${stripHtml(post.excerpt?.rendered)}`,
      ].join("\n"),
    });
    if (items.length >= 6) break;
  }
  return items;
}

async function gatherThailandHackathonsDir() {
  const html = await fetchTextSafe("https://thailandhackathons.com/hackathons/bangkok", 10000);
  if (!html) return [];
  const items = [];
  const seen = new Set();
  for (const m of html.matchAll(/href="(\/events\/[a-z0-9-]+)"/gi)) {
    const url = `https://thailandhackathons.com${m[1]}`;
    if (seen.has(url)) continue;
    seen.add(url);
    items.push({
      url,
      sourceName: "Hackathon Thailand",
      allowClosed: false,
      hintText: `รายการ Hackathon ในกรุงเทพฯ ประเทศไทย: ${url}`,
    });
  }
  return items;
}

async function extractThailandTech(candidate, todayIso, attempt = 1) {
  const apiKey = process.env.TYPHOON_API_KEY?.trim();
  const baseUrl =
    process.env.TYPHOON_BASE_URL?.trim() || "https://api.opentyphoon.ai/v1";
  const model =
    process.env.TYPHOON_TEXT_MODEL?.trim() || "typhoon-v2.5-30b-a3b-instruct";

  let enrichedText = candidate.hintText || "";
  const detailMd = await fetchTextSafe(`https://r.jina.ai/${candidate.url}`, 14000);
  if (detailMd && detailMd.length > 150) {
    enrichedText = `${enrichedText}\n\n--- รายละเอียดจากหน้าเว็บ ---\n${detailMd.slice(0, 9000)}`;
  }

  const beYear = Number(todayIso.slice(0, 4)) + 543;
  const systemPrompt = `คุณคือ AI คัดกรองและสกัดข้อมูลการแข่งขันสำหรับ "TechComp Hub ประเทศไทย"
วันนี้คือ ค.ศ. ${todayIso} (พ.ศ. ${beYear})

กติกาการคัดกรอง (Strict Thailand Tech Gatekeeper):
1) ตั้งค่า "is_tech_related": true เฉพาะเมื่อเป็นงานแข่งขันในประเทศไทย ที่เกี่ยวกับ Computer Science, Software Development, AI/ML/Data, Cybersecurity/CTF, Robotics/IoT, Game Dev, UI/UX Digital Product Design หรือ Tech Hackathon ที่มีผลงานซอฟต์แวร์/AI/ฮาร์ดแวร์/ระบบดิจิทัลเท่านั้น
2) ตั้งค่า "is_tech_related": false ทันที สำหรับ:
   - งานประกวดนโยบายสาธารณะ (Policy Hackathon ที่ไม่ได้สร้างซอฟต์แวร์/เทคโนโลยี)
   - การแข่งขันแผนการตลาด / ธุรกิจทั่วไปที่ไม่เน้นพัฒนาซอฟต์แวร์/เทคโนโลยี
   - การประกวดคลิปวิดีโอ / ภาพยนตร์สั้น / TikTok / ร้องเพลง / วาดภาพ / คณิตศาสตร์ / วิทยาศาสตร์การแพทย์ (MedQuiz) / อ่านภาษาอังกฤษ / Open House
   - งานแข่งในต่างประเทศที่ไม่ได้จัดสำหรับนักเรียน/นักศึกษาในไทย
3) category ต้องเลือกให้ตรงที่สุด 1 ค่าจาก 8 ค่านี้เท่านั้น:
   ${TECH_CATEGORIES.join(" | ")}
4) deadline: แปลง พ.ศ. เป็น ค.ศ. (ลบ 543) เสมอ แล้วตอบรูปแบบ "YYYY-MM-DD" หรือ null
   - หากมีหลายรอบหรือระบุช่วงวันที่ปิดรับสมัคร (เช่น 5 พ.ย. 2569 - 26 พ.ย. 2569) ให้ใช้วันปิดรับสมัครจริง
5) recommended_roles: เลือก 1-5 ค่าจาก: ${TECH_ROLES.join(", ")}
6) tech_stack_hints: ชื่อเทคโนโลยี/ภาษาที่เกี่ยวข้อง 2-6 รายการ
7) eligibility และ summary: เขียนเป็นภาษาไทยที่ชัดเจน กระชับ อ่านง่าย ครบใจความสำคัญ (ผู้จัด รูปแบบงาน รางวัล/สิทธิประโยชน์)

ตอบกลับเป็น JSON Object เดียวเท่านั้น:
{
  "is_tech_related": boolean,
  "rejection_reason": string | null,
  "title": string,
  "category": string,
  "deadline": "YYYY-MM-DD" | null,
  "min_size": number,
  "max_size": number,
  "recommended_roles": string[],
  "tech_stack_hints": string[],
  "eligibility": string | null,
  "summary": string
}`;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 1300,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `URL: ${candidate.url}\nแหล่งที่มา: ${candidate.sourceName}\n\n${enrichedText}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(30000),
  });

  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    await new Promise((r) => setTimeout(r, 1500 * attempt));
    return extractThailandTech(candidate, todayIso, attempt + 1);
  }

  if (!res.ok) {
    throw new Error(`OpenTyphoon HTTP ${res.status}`);
  }

  const payload = await res.json();
  const content = payload?.choices?.[0]?.message?.content ?? "";
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const json = JSON.parse(cleaned);

  const isTech = Boolean(json.is_tech_related);
  const minSize = Math.max(1, Math.min(20, Math.round(Number(json.min_size) || 1)));
  const maxSize = Math.max(minSize, Math.min(20, Math.round(Number(json.max_size) || 4)));

  return {
    is_tech_related: isTech,
    rejection_reason: json.rejection_reason ?? null,
    title: String(json.title || "").trim() || "ไม่ระบุชื่อรายการแข่งขัน",
    category: coerceCategory(json.category, candidate.hintText),
    deadline: normalizeIsoDate(json.deadline),
    min_size: minSize,
    max_size: maxSize,
    recommended_roles: coerceRoles(json.recommended_roles),
    tech_stack_hints: Array.isArray(json.tech_stack_hints)
      ? Array.from(
          new Set(
            json.tech_stack_hints.map((x) => String(x || "").trim()).filter(Boolean),
          ),
        ).slice(0, 8)
      : [],
    eligibility: json.eligibility ? String(json.eligibility).trim() : null,
    summary: String(json.summary || "").trim() || "การแข่งขันด้านคอมพิวเตอร์และเทคโนโลยีในประเทศไทย",
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const apiKey = process.env.TYPHOON_API_KEY?.trim();
  if (!databaseUrl || !apiKey) {
    throw new Error("Missing DATABASE_URL or TYPHOON_API_KEY");
  }

  const replaceAll = process.argv.includes("--replace-all");
  const todayIso = getTodayIsoBangkok();
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });

  console.log(`[ingest-th] Gathering Thailand-only competitions (today=${todayIso}, replaceAll=${replaceAll})...`);
  const [hackza, portcas, contester, ctfTh, thDir] = await Promise.all([
    gatherHackzaThailand(),
    gatherPortcasThailand(),
    gatherContesterThailand(),
    gatherCtfThailand(),
    gatherThailandHackathonsDir(),
  ]);

  const combined = [...thDir, ...portcas, ...hackza, ...contester, ...ctfTh];
  const uniqueByUrl = [];
  const seenUrls = new Set();
  for (const item of combined) {
    if (!seenUrls.has(item.url)) {
      seenUrls.add(item.url);
      uniqueByUrl.push(item);
    }
  }

  console.log(
    `[ingest-th] Candidates: Hackza=${hackza.length}, PorTCAS=${portcas.length}, Contester=${contester.length}, CTF.in.th=${ctfTh.length} -> Unique=${uniqueByUrl.length}`,
  );

  const prepClient = await pool.connect();
  let existingSet = new Set();
  try {
    await prepClient.query("BEGIN");
    await prepClient.query("SELECT set_config('app.system_mode', 'on', true)");

    if (replaceAll) {
      const delRes = await prepClient.query("DELETE FROM public.competitions");
      console.log(`[ingest-th] Cleared ${delRes.rowCount} previous competitions (--replace-all)`);
    } else {
      const existingRes = await prepClient.query(
        "SELECT source_url FROM public.competitions WHERE source_url IS NOT NULL",
      );
      existingSet = new Set(existingRes.rows.map((r) => r.source_url));
    }

    await prepClient.query("COMMIT");
  } catch (err) {
    await prepClient.query("ROLLBACK");
    throw err;
  } finally {
    prepClient.release();
  }

  const toProcess = uniqueByUrl.filter((c) => !existingSet.has(c.url));
  console.log(`[ingest-th] Analyzing ${toProcess.length} Thailand candidates with OpenTyphoon...`);

  const extractedResults = [];
  const concurrency = 2;
  let index = 0;

  async function worker() {
    while (index < toProcess.length) {
      const currentIdx = index;
      index += 1;
      const candidate = toProcess[currentIdx];
      try {
        const extracted = await extractThailandTech(candidate, todayIso);
        extractedResults.push({ candidate, extracted });
        console.log(
          `  [${currentIdx + 1}/${toProcess.length}] ${extracted.is_tech_related ? "TECH" : "SKIP"} | ${extracted.category} | ${extracted.deadline ?? "no-date"} | ${extracted.title.slice(0, 62)}`,
        );
      } catch (err) {
        console.warn(
          `  [${currentIdx + 1}/${toProcess.length}] ERR (${candidate.url}): ${err.message}`,
        );
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const seenTitleKeys = new Set();
  const validOpen = [];
  const validClosed = [];
  let skippedNonTech = 0;
  let skippedDuplicateTitle = 0;

  for (const item of extractedResults) {
    if (!item.extracted.is_tech_related) {
      skippedNonTech += 1;
      continue;
    }

    const titleKey = normalizeTitleKey(item.extracted.title);
    if (titleKey && seenTitleKeys.has(titleKey)) {
      skippedDuplicateTitle += 1;
      continue;
    }
    if (titleKey) seenTitleKeys.add(titleKey);

    const dl = item.extracted.deadline;
    if (dl && dl < todayIso) {
      if (item.candidate.allowClosed) {
        validClosed.push(item);
      }
      continue;
    }

    validOpen.push(item);
  }

  const insertClient = await pool.connect();
  let insertedOpen = 0;
  let insertedClosed = 0;

  try {
    await insertClient.query("BEGIN");
    await insertClient.query("SELECT set_config('app.system_mode', 'on', true)");

    const insertOne = async (candidate, extracted, status) => {
      const res = await insertClient.query(
        `INSERT INTO public.competitions (
           title, category, deadline, min_size, max_size,
           recommended_roles, tech_stack_hints, eligibility, summary,
           source_url, source_type, status, created_by
         )
         VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, 'ai_auto', $11, NULL)
         ON CONFLICT (source_url) WHERE source_url IS NOT NULL AND btrim(source_url) <> ''
         DO NOTHING
         RETURNING id`,
        [
          extracted.title,
          extracted.category,
          extracted.deadline,
          extracted.min_size,
          extracted.max_size,
          extracted.recommended_roles,
          extracted.tech_stack_hints,
          extracted.eligibility,
          extracted.summary,
          candidate.url,
          status,
        ],
      );
      return (res.rowCount ?? 0) > 0;
    };

    for (const { candidate, extracted } of validOpen) {
      if (await insertOne(candidate, extracted, "open")) insertedOpen += 1;
    }

    for (const { candidate, extracted } of validClosed) {
      if (await insertOne(candidate, extracted, "closed")) insertedClosed += 1;
    }

    const summaryRes = await insertClient.query(
      `SELECT status, category, count(*)::int AS total
       FROM public.competitions
       GROUP BY status, category
       ORDER BY status, category`,
    );

    await insertClient.query("COMMIT");
    console.log(
      `\n[ingest-th] Done! open=${insertedOpen}, closed=${insertedClosed}, skippedNonTech=${skippedNonTech}, skippedDupTitle=${skippedDuplicateTitle}`,
    );
    console.table(summaryRes.rows);
  } catch (err) {
    await insertClient.query("ROLLBACK");
    throw err;
  } finally {
    insertClient.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[ingest-th] Fatal error:", err);
  process.exit(1);
});
