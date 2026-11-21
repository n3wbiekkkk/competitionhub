import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

const root = process.cwd();

function loadEnvFile() {
  if (process.env.BENCH_DATABASE_URL) return;
  try {
    const content = readFileSync(path.join(root, ".env.local"), "utf8");
    for (const line of content.split("\n")) {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
      if (match && !(match[1] in process.env)) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // Connection may be supplied by the environment instead.
  }
}

loadEnvFile();

const connectionString = process.env.BENCH_DATABASE_URL?.trim();
if (!connectionString) {
  console.error("BENCH_DATABASE_URL is required for benchmark seeding.");
  process.exit(1);
}

let databaseName = "unknown";
try {
  databaseName = new URL(connectionString).pathname.replace(/^\//, "");
} catch {
  console.error("BENCH_DATABASE_URL is not a valid PostgreSQL URL.");
  process.exit(1);
}
const safeName = /bench|test|verify|ci/i.test(databaseName);
if (!safeName && process.env.ALLOW_BENCH_SEED !== "1") {
  console.error(
    `Refusing to seed database "${databaseName}" without ALLOW_BENCH_SEED=1.`,
  );
  process.exit(1);
}

const STUDENTS = 500;
const COMPETITIONS = 200;
const TEAMS = 100;

const CATEGORIES = [
  "Programming / Competitive",
  "AI & Data Science",
  "Web & Mobile Dev",
  "Cybersecurity / CTF",
  "Robotics & IoT",
  "Game Dev",
  "Tech Hackathon & Innovation",
  "UI/UX & Digital Design",
];
const ROLES = [
  "Frontend",
  "Backend",
  "Full-Stack",
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
const SKILLS = ["React", "Node.js", "Python", "TypeScript", "PostgreSQL", "Figma"];
const SOURCES = [
  "Hackza Thailand",
  "Hackathon Thailand",
  "PorTCAS Thailand",
  "Contester Thailand",
  "CTF Thailand",
  "Google News Thailand",
  "การค้นหาเว็บ",
];

function benchUuid(key) {
  const hex = createHash("sha256")
    .update(`techcomp-bench:v1:${key}`)
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function isoDate(offsetDays) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function isoTime(offsetMinutes) {
  const date = new Date();
  date.setUTCMinutes(date.getUTCMinutes() + offsetMinutes);
  return date.toISOString();
}

async function insertMany(client, table, columns, rows) {
  if (rows.length === 0) return;
  const columnList = columns.join(", ");
  const valueRows = rows.map(
    (_, rowIndex) =>
      `(${columns.map((_, colIndex) => `$${rowIndex * columns.length + colIndex + 1}`).join(", ")})`,
  );
  await client.query(
    `insert into ${table} (${columnList}) values ${valueRows.join(", ")} on conflict do nothing`,
    rows.flat(),
  );
}

const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();

try {
  await client.query("begin");
  await client.query("select set_config('app.system_mode', 'on', true)");
  await client.query("select set_config('app.current_user_id', '', true)");

  const teacherId = benchUuid("teacher:0");
  const accounts = [
    [
      teacherId,
      "bench-teacher@example.invalid",
      "bench-password-placeholder",
    ],
  ];
  const profiles = [
    [
      teacherId,
      "อาจารย์ตัวอย่าง",
      "อาจารย์",
      "bench-teacher@example.invalid",
      "teacher",
      null,
      ["PostgreSQL"],
      false,
      isoTime(-60 * 24),
    ],
  ];

  for (let i = 1; i <= STUDENTS; i += 1) {
    const id = benchUuid(`student:${i}`);
    accounts.push([id, `bench-student-${i}@example.invalid`, "bench-password-placeholder"]);
    profiles.push([
      id,
      `นักเรียนตัวอย่าง ${i}`,
      `ตัวอย่าง${i}`,
      `bench-student-${i}@example.invalid`,
      "student",
      `ม.${((i - 1) % 6) + 1}/${((i - 1) % 14) + 1}`,
      [SKILLS[i % SKILLS.length], SKILLS[(i + 2) % SKILLS.length]],
      true,
      isoTime(-60 * 12),
    ]);
  }
  await insertMany(
    client,
    "public.auth_accounts",
    ["id", "email", "password_hash"],
    accounts,
  );
  await insertMany(
    client,
    "public.profiles",
    ["id", "full_name", "nickname", "email", "role", "grade", "skills", "directory_visible", "created_at"],
    profiles,
  );

  const competitionIds = Array.from({ length: COMPETITIONS }, (_, i) =>
    benchUuid(`competition:${i + 1}`),
  );
  const competitions = competitionIds.map((id, index) => {
    const i = index + 1;
    return [
      id,
      `การแข่งขันตัวอย่าง tech ${i}`,
      CATEGORIES[i % CATEGORIES.length],
      isoDate(30 + (i % 180)),
      2,
      4,
      [ROLES[i % ROLES.length], ROLES[(i + 3) % ROLES.length]],
      [SKILLS[i % SKILLS.length]],
      "เปิดรับนักเรียนมัธยมศึกษาในประเทศไทย",
      "ข้อมูลจำลองสำหรับการทดสอบประสิทธิภาพ ไม่ใช่การแข่งขันจริง",
      "manual",
      i % 4 === 0 ? "pending_review" : "open",
      teacherId,
      isoTime(-60 * 6),
    ];
  });
  await insertMany(
    client,
    "public.competitions",
    [
      "id", "title", "category", "deadline", "min_size", "max_size",
      "recommended_roles", "tech_stack_hints", "eligibility", "summary",
      "source_type", "status", "created_by", "created_at",
    ],
    competitions,
  );

  const interests = [];
  for (let i = 1; i <= STUDENTS; i += 1) {
    const userId = benchUuid(`student:${i}`);
    for (let offset = 0; offset < 3; offset += 1) {
      const competitionIndex = (i + offset * 7 - 1) % COMPETITIONS;
      interests.push([
        userId,
        competitionIds[competitionIndex],
        ROLES[(i + offset) % ROLES.length],
        "ความสนใจข้อมูลจำลอง",
        isoTime(-60 * 3),
      ]);
    }
  }
  await insertMany(
    client,
    "public.interests",
    ["user_id", "competition_id", "preferred_role", "note", "created_at"],
    interests,
  );

  const teams = [];
  const teamMembers = [];
  for (let i = 1; i <= TEAMS; i += 1) {
    const teamId = benchUuid(`team:${i}`);
    teams.push([
      teamId,
      competitionIds[(i * 2 - 1) % COMPETITIONS],
      `ทีมตัวอย่าง ${i}`,
      teacherId,
      i % 2 === 0 ? "confirmed" : "draft",
      isoTime(-60 * 2),
      isoTime(-60 * 2),
    ]);
    for (let member = 0; member < 3; member += 1) {
      teamMembers.push([
        teamId,
        benchUuid(`student:${((i - 1) * 3 + member) % STUDENTS + 1}`),
        ROLES[(i + member) % ROLES.length],
      ]);
    }
  }
  await insertMany(
    client,
    "public.teams",
    ["id", "competition_id", "name", "advisor_id", "status", "created_at", "updated_at"],
    teams,
  );
  await insertMany(
    client,
    "public.team_members",
    ["team_id", "user_id", "assigned_role"],
    teamMembers,
  );

  await insertMany(
    client,
    "public.email_outbox",
    ["id", "to_email", "template", "status", "attempts", "scheduled_at", "created_at"],
    Array.from({ length: 30 }, (_, i) => [
      benchUuid(`outbox:${i + 1}`),
      `bench-recipient-${i + 1}@example.invalid`,
      i % 2 === 0 ? "password_reset" : "team_invite",
      ["pending", "sent", "failed"][i % 3],
      i % 3,
      isoTime(-i),
      isoTime(-i),
    ]),
  );

  await insertMany(
    client,
    "public.audit_logs",
    ["id", "actor_id", "action", "target_type", "target_id", "metadata", "created_at"],
    Array.from({ length: 40 }, (_, i) => [
      benchUuid(`audit:${i + 1}`),
      teacherId,
      i % 3 === 0 ? "ai.request" : "admin.user_update",
      i % 3 === 0 ? "extract" : "profiles",
      benchUuid(`student:${(i % STUDENTS) + 1}`),
      JSON.stringify({
        provider: "opentyphoon",
        duration_ms: 120 + (i * 37) % 900,
        ok: i % 7 !== 0,
      }),
      isoTime(-i / 4),
    ]).map((row) => {
      const copy = [...row];
      copy[5] = `${copy[5]}::jsonb`;
      return copy;
    }),
  );

  const sourceIds = SOURCES.map((_, i) => benchUuid(`scout-source:${i + 1}`));
  await insertMany(
    client,
    "public.scout_sources",
    ["id", "name", "base_url", "adapter_type", "config", "enabled", "last_status", "consecutive_failures"],
    SOURCES.map((name, i) => [
      sourceIds[i],
      name,
      "https://example.invalid/feed",
      "html-list",
      "{}",
      true,
      i === 3 ? "failed" : "ok",
      i === 3 ? 2 : 0,
    ]).map((row) => {
      const copy = [...row];
      copy[4] = `${copy[4]}::jsonb`;
      return copy;
    }),
  );

  const runIds = Array.from({ length: 12 }, (_, i) => benchUuid(`scout-run:${i + 1}`));
  await insertMany(
    client,
    "public.scout_runs",
    ["id", "started_at", "finished_at", "status", "found_count", "inserted_count", "duplicate_count"],
    runIds.map((id, i) => [
      id,
      isoTime(-60 * 24 * i),
      isoTime(-60 * 24 * i + 5),
      i === 2 ? "failed" : "completed",
      40 + i * 3,
      4 + i,
      20 + i,
    ]),
  );
  await insertMany(
    client,
    "public.scout_run_sources",
    ["id", "run_id", "source_id", "source_name", "status", "found_count"],
    runIds.flatMap((runId, runIndex) =>
      SOURCES.map((name, sourceIndex) => [
        benchUuid(`scout-run-source:${runIndex + 1}:${sourceIndex + 1}`),
        runId,
        sourceIds[sourceIndex],
        name,
        runIndex === 2 && sourceIndex === 3 ? "failed" : "ok",
        5 + sourceIndex,
      ]),
    ),
  );

  await insertMany(
    client,
    "public.rate_limit_buckets",
    ["key", "hit_count", "window_start", "expires_at"],
    Array.from({ length: 20 }, (_, i) => [
      `bench:rate-limit:${i + 1}`,
      i + 1,
      isoTime(-i / 6),
      isoTime(60 - i),
    ]),
  );

  await client.query("commit");

  for (const table of [
    "profiles",
    "competitions",
    "interests",
    "teams",
    "team_members",
    "email_outbox",
    "audit_logs",
    "scout_runs",
    "scout_run_sources",
  ]) {
    const result = await client.query(`select count(*)::text as count from public.${table}`);
    console.log(`${table}=${result.rows[0]?.count ?? "0"}`);
  }
  console.log(`database=${databaseName}`);
  console.log("BENCHMARK SEED COMPLETE");
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  console.error("Benchmark seed failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
