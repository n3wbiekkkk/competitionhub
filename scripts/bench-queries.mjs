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
  console.error("BENCH_DATABASE_URL is required to run the query benchmark.");
  process.exit(1);
}

const runsArg = process.argv
  .find((arg) => arg.startsWith("--runs="))
  ?.slice("--runs=".length);
const runs = runsArg === undefined ? 3 : Number(runsArg);
if (!Number.isInteger(runs) || runs < 1 || runs > 20) {
  console.error("--runs must be an integer from 1 to 20.");
  process.exit(1);
}

const QUERIES = [
  {
    name: "feed_open_competitions",
    sql: `select c.id, c.title, c.category, c.deadline,
                 count(i.id)::bigint as interest_count
          from public.competitions c
          left join public.interests i on i.competition_id = c.id
          where c.status in ('open', 'closed')
          group by c.id
          order by c.deadline asc nulls last, c.created_at desc
          limit 50`,
  },
  {
    name: "competition_detail",
    sql: `select c.id, c.title, c.category, c.deadline, c.min_size, c.max_size,
                 c.recommended_roles, c.tech_stack_hints, c.summary
          from public.competitions c
          where c.title = $1
          limit 1`,
    params: ["การแข่งขันตัวอย่าง tech 1"],
  },
  {
    name: "competition_interest_counts",
    sql: `select competition_id, interest_count
          from public.get_competition_interest_counts(null)
          order by interest_count desc
          limit 50`,
  },
  {
    name: "team_builder_interested_students",
    sql: `select p.id, p.full_name, p.grade, p.skills, i.preferred_role
          from public.interests i
          join public.profiles p on p.id = i.user_id
          where i.competition_id = (select id from public.competitions order by title limit 1)
          order by i.created_at asc`,
  },
  {
    name: "team_builder_teams_members",
    sql: `select t.id as team_id, tm.user_id, tm.assigned_role,
                 p.full_name, p.grade, p.skills
          from public.teams t
          join public.team_members tm on tm.team_id = t.id
          join public.profiles p on p.id = tm.user_id
          where t.competition_id = (select id from public.competitions order by title limit 1)
          order by p.full_name asc`,
  },
  {
    name: "my_interests_and_teams",
    sql: `with me as (
            select id from public.profiles where email = $1 limit 1
          )
          select i.competition_id, i.preferred_role, c.title, c.deadline
          from public.interests i
          join me on me.id = i.user_id
          join public.competitions c on c.id = i.competition_id
          order by c.deadline asc nulls last`,
    params: ["bench-student-1@example.invalid"],
  },
  {
    name: "profile_directory_search",
    sql: `select p.id, p.full_name, p.nickname, p.grade, p.skills
          from public.profiles p
          where p.directory_visible
            and (
              strpos(lower(p.full_name), lower($1)) > 0
              or exists (
                select 1 from unnest(p.skills) as skill
                where strpos(lower(skill), lower($1)) > 0
              )
            )
          order by p.full_name asc, p.id asc
          limit 50`,
    params: ["python"],
  },
  {
    name: "email_outbox_pending",
    sql: `select id, to_email, template, attempts, scheduled_at
          from public.email_outbox
          where status = 'pending'
          order by scheduled_at asc
          limit 50`,
  },
  {
    name: "scout_runs_last_30d",
    sql: `select source_name,
                 count(*)::bigint as runs,
                 coalesce(sum(r.found_count), 0)::bigint as found,
                 0::bigint as inserted
          from public.scout_run_sources r
          join public.scout_runs s on s.id = r.run_id
          where s.started_at >= now() - interval '30 days'
          group by source_name
          order by source_name`,
  },
  {
    name: "ops_table_sizes",
    sql: `select c.relname as name,
                 (select count(*) from public.profiles) as profiles,
                 pg_total_relation_size(c.oid)::bigint as bytes
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind in ('r', 'p')
          order by bytes desc`,
  },
];

function sumPlan(plan, key) {
  if (!plan || typeof plan !== "object") return 0;
  const value = typeof plan[key] === "number" ? plan[key] : 0;
  const children = Array.isArray(plan.Plans) ? plan.Plans : [];
  return value + children.reduce((total, child) => total + sumPlan(child, key), 0);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5000 });
const client = await pool.connect();

try {
  await client.query("set statement_timeout = '30s'");
  await client.query("select set_config('app.system_mode', 'on', true)");
  await client.query("select set_config('app.current_user_id', '', true)");

  const results = [];
  for (const query of QUERIES) {
    const samples = [];
    for (let run = 0; run < runs; run += 1) {
      const explained = await client.query(
        `explain (analyze, buffers, format json) ${query.sql}`,
        query.params ?? [],
      );
      const envelope = explained.rows[0]?.["QUERY PLAN"]?.[0];
      const plan = envelope?.Plan;
      if (!plan) throw new Error(`No plan returned for ${query.name}`);
      samples.push({
        rows: typeof plan["Actual Rows"] === "number" ? plan["Actual Rows"] : 0,
        executionMs: plan["Actual Total Time"] ?? 0,
        planningMs: envelope["Planning Time"] ?? 0,
        sharedHit: sumPlan(plan, "Shared Hit Blocks"),
        sharedRead: sumPlan(plan, "Shared Read Blocks"),
        tempRead: sumPlan(plan, "Temp Read Blocks"),
        tempWritten: sumPlan(plan, "Temp Written Blocks"),
      });
    }
    results.push({
      name: query.name,
      rows: median(samples.map((sample) => sample.rows)),
      executionMs: median(samples.map((sample) => sample.executionMs)),
      planningMs: median(samples.map((sample) => sample.planningMs)),
      sharedHit: median(samples.map((sample) => sample.sharedHit)),
      sharedRead: median(samples.map((sample) => sample.sharedRead)),
      tempRead: median(samples.map((sample) => sample.tempRead)),
      tempWritten: median(samples.map((sample) => sample.tempWritten)),
    });
  }

  console.log(`queries=${results.length} runs=${runs}`);
  console.log(
    ["query", "rows", "exec_ms", "plan_ms", "shared_hit", "shared_read", "temp_read", "temp_write"].join("\t"),
  );
  for (const result of [...results].sort((a, b) => b.executionMs - a.executionMs)) {
    console.log(
      [
        result.name,
        Math.round(result.rows),
        result.executionMs.toFixed(2),
        result.planningMs.toFixed(2),
        Math.round(result.sharedHit),
        Math.round(result.sharedRead),
        Math.round(result.tempRead),
        Math.round(result.tempWritten),
      ].join("\t"),
    );
  }
  console.log("BENCHMARK COMPLETE");
} catch (error) {
  console.error("Benchmark failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
