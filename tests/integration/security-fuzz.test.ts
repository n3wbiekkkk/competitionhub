import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID, scrypt } from "node:crypto";
import { after, before, test } from "node:test";
import { SignJWT } from "jose";
import { Pool, type PoolClient } from "pg";

const adminDbUrl = process.env.MIGRATION_DATABASE_URL;
const appDbUrl = process.env.DATABASE_URL;
const baseUrl =
  process.env.FUZZ_BASE_URL ??
  process.env.E2E_BASE_URL ??
  "http://127.0.0.1:3100";
const origin = new URL(baseUrl).origin;
const sessionSecret = process.env.SESSION_SECRET;
const marker = `e2e-fuzz-${randomUUID()}`;

const adminPool = adminDbUrl ? new Pool({ connectionString: adminDbUrl, max: 1 }) : null;
const appPool = appDbUrl ? new Pool({ connectionString: appDbUrl, max: 1 }) : null;

interface FuzzUser {
  id: string;
  email: string;
  token: string;
  jti: string;
}

interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

interface TableSpec {
  table: string;
  values: Record<string, unknown>;
}

const createdUserIds: string[] = [];
const createdCompetitionIds: string[] = [];
const createdRateKeys: string[] = [];
let competitionId: string | null = null;

before(async () => {
  assert.ok(adminDbUrl, "MIGRATION_DATABASE_URL is required for security fuzzing");
  assert.ok(appDbUrl, "DATABASE_URL is required for RLS fuzzing");
  assert.ok(
    sessionSecret && sessionSecret.length >= 16,
    "SESSION_SECRET must be at least 16 characters",
  );
  const response = await fetch(new URL("/api/health", baseUrl));
  assert.equal(
    response.status,
    200,
    `security fuzz requires a running app at ${baseUrl}`,
  );
});

after(async () => {
  if (adminPool) {
    for (const id of createdCompetitionIds) {
      await adminPool.query("DELETE FROM public.competitions WHERE id = $1", [id]);
    }
  }
  if (adminPool) {
    await adminPool.query("DELETE FROM public.webhook_routes WHERE name = $1", [
      marker,
    ]);
    await adminPool.query(
      "DELETE FROM public.badge_definitions WHERE code = $1",
      [marker],
    );
    await adminPool.query("DELETE FROM public.rate_limit_buckets WHERE key = ANY($1::text[])", [
      createdRateKeys,
    ]);
    for (const userId of createdUserIds) {
      await adminPool.query("DELETE FROM public.auth_accounts WHERE id = $1", [
        userId,
      ]);
    }
    await adminPool.end();
  }
  await appPool?.end();
});

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
  return `scrypt$${salt}$${key.toString("hex")}`;
}

async function signToken(
  user: { id: string; email: string },
  jti: string,
  role: "student" | "teacher" = "student",
  sessionVersion = 0,
): Promise<string> {
  assert.ok(sessionSecret, "SESSION_SECRET is required");
  return new SignJWT({
    email: user.email,
    role,
    fullName: `Fuzz ${role}`,
    sv: sessionVersion,
    jti,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(sessionSecret));
}

async function createUser(
  role: "student" | "teacher" = "student",
): Promise<FuzzUser> {
  assert.ok(adminPool, "admin database pool is not configured");
  const id = randomUUID();
  const jti = randomUUID();
  const email = `fuzz-${randomUUID()}@example.test`;
  const password = `Fuzz-${randomUUID()}!`;
  await adminPool.query(
    "INSERT INTO public.auth_accounts (id, email, password_hash) VALUES ($1, $2, $3)",
    [id, email, await hashPassword(password)],
  );
  await adminPool.query(
    `INSERT INTO public.profiles
       (id, full_name, nickname, email, role, grade, directory_visible)
     VALUES ($1, $2, 'fuzz', $3, $4, 'ม.5/1', true)`,
    [id, `Fuzz ${role}`, email, role],
  );
  await adminPool.query(
    "INSERT INTO public.auth_security (user_id, session_version) VALUES ($1, 0)",
    [id],
  );
  await adminPool.query(
    `INSERT INTO public.user_sessions (jti, user_id, user_agent, ip_address)
     VALUES ($1, $2, 'security-fuzz', 'direct')`,
    [jti, id],
  );
  createdUserIds.push(id);
  return { id, email, token: await signToken({ id, email }, jti, role), jti };
}

async function withRls<T>(userId: string, fn: (client: PoolClient) => Promise<T>) {
  assert.ok(appPool, "application database pool is not configured");
  const client = await appPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.system_mode', 'off', true)");
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [
      userId,
    ]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function tableExists(table: string): Promise<boolean> {
  assert.ok(adminPool, "admin database pool is not configured");
  const result = await adminPool.query<{ reg: string | null }>(
    "SELECT to_regclass($1)::text AS reg",
    [`public.${table}`],
  );
  return result.rows[0]?.reg !== null;
}

async function columnsFor(table: string): Promise<ColumnInfo[]> {
  assert.ok(adminPool, "admin database pool is not configured");
  const result = await adminPool.query<ColumnInfo>(
    `SELECT column_name, data_type, is_nullable, column_default::text
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return result.rows;
}

function literalFor(
  column: ColumnInfo,
  value: unknown,
  index: number,
): { sql: string; value?: unknown } {
  if (column.data_type === "bytea") return { sql: `$${index}::bytea`, value: Buffer.from(String(value ?? marker)) };
  if (column.data_type === "jsonb") return { sql: `$${index}::jsonb`, value: typeof value === "string" ? value : JSON.stringify(value ?? {}) };
  if (column.data_type === "ARRAY") return { sql: `$${index}::text[]`, value };
  if (column.data_type === "timestamp with time zone") return { sql: "now()" };
  if (column.data_type === "timestamp without time zone") return { sql: "now()" };
  if (column.data_type === "date") return { sql: "current_date" };
  if (column.data_type === "boolean") return { sql: `$${index}`, value: Boolean(value) };
  if (["integer", "bigint", "smallint", "numeric", "double precision"].includes(column.data_type)) {
    return { sql: `$${index}`, value: Number(value ?? 1) };
  }
  return { sql: `$${index}`, value };
}

function generatedValue(column: ColumnInfo): unknown {
  const name = column.column_name;
  if (name.includes("email")) return `fuzz-${marker}@example.test`;
  if (column.data_type === "uuid") return randomUUID();
  if (name.includes("hash")) return marker;
  if (name.includes("url")) return `https://example.test/${marker}`;
  return marker;
}

async function seedRow(
  table: string,
  values: Record<string, unknown>,
): Promise<void> {
  assert.ok(adminPool, "admin database pool is not configured");
  if (!(await tableExists(table))) return;

  const columns = await columnsFor(table);
  const names: string[] = [];
  const literals: string[] = [];
  const params: unknown[] = [];

  for (const column of columns) {
    const provided = Object.prototype.hasOwnProperty.call(values, column.column_name);
    const required = column.is_nullable === "NO" && column.column_default === null;
    if (!provided && !required) continue;
    const raw = provided ? values[column.column_name] : generatedValue(column);
    const literal = literalFor(column, raw, params.length + 1);
    names.push(quoteIdent(column.column_name));
    literals.push(literal.sql);
    if (literal.value !== undefined) params.push(literal.value);
  }

  if (names.length === 0) return;
  await adminPool.query(
    `INSERT INTO public.${quoteIdent(table)} (${names.join(", ")}) VALUES (${literals.join(", ")})`,
    params,
  );
}

async function assertNoCrossUserAccess(
  attackerId: string,
  spec: TableSpec,
): Promise<boolean> {
  if (!(await tableExists(spec.table))) return false;

  const read = await withRls(attackerId, async (client) => {
    const result = await client.query(
      `SELECT 1 FROM public.${quoteIdent(spec.table)} LIMIT 1`,
    );
    return result.rowCount ?? 0;
  });
  assert.equal(
    read,
    0,
    `RLS allowed cross-user SELECT on public.${spec.table}`,
  );

  let writeRejected = false;
  try {
    const deleted = await withRls(attackerId, async (client) => {
      const result = await client.query(
        `DELETE FROM public.${quoteIdent(spec.table)}`,
      );
      return result.rowCount ?? 0;
    });
    writeRejected = deleted === 0;
  } catch {
    writeRejected = true;
  }
  assert.equal(
    writeRejected,
    true,
    `RLS allowed cross-user DELETE on public.${spec.table}`,
  );
  return true;
}

async function mutation(
  pathname: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(new URL(pathname, baseUrl), {
    redirect: "manual",
    ...init,
  });
}

function jsonMutationInit(body: unknown, headers: Record<string, string> = {}): RequestInit {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

test("Wave 2 ทุกตารางปฏิเสธการอ่านและเขียนข้ามผู้ใช้", async () => {
  assert.ok(adminPool, "MIGRATION_DATABASE_URL is required");

  const owner = await createUser("student");
  const recipient = await createUser("student");
  const attacker = await createUser("student");

  const competition = await adminPool.query<{ id: string }>(
    `INSERT INTO public.competitions
       (title, category, deadline, min_size, max_size, summary, source_url, source_type, status)
     VALUES ($1, 'Programming / Competitive', (current_date + interval '30 days')::date,
             1, 1, $2, $3, 'manual', 'open')
     RETURNING id`,
    [`Fuzz Competition ${marker}`, `fuzz ${marker}`, `https://example.test/${marker}`],
  );
  competitionId = competition.rows[0]?.id ?? null;
  if (competitionId) createdCompetitionIds.push(competitionId);
  assert.ok(competitionId, "could not seed competition");

  const team = await adminPool.query<{ id: string }>(
    `INSERT INTO public.teams (competition_id, name, status)
     VALUES ($1, $2, 'draft') RETURNING id`,
    [competitionId, `Fuzz Team ${marker}`],
  );
  const teamId = team.rows[0]?.id;
  assert.ok(teamId, "could not seed team");
  await adminPool.query(
    `INSERT INTO public.team_members (team_id, user_id, assigned_role)
     VALUES ($1, $2, 'Frontend')`,
    [teamId, owner.id],
  );
  await adminPool.query("UPDATE public.teams SET status = 'confirmed' WHERE id = $1", [teamId]);

  if (await tableExists("badge_definitions")) {
    await seedRow("badge_definitions", {
      code: marker,
      name_th: `Fuzz ${marker}`,
      description_th: `fuzz ${marker}`,
      category: "milestone",
      icon_name: "Award",
      tier: "bronze",
      criterion: "interest_count",
      threshold: 1,
    });
  }

  const specs: TableSpec[] = [
    {
      table: "team_invitations",
      values: {
        team_id: teamId,
        direction: "team_invite",
        sender_id: owner.id,
        recipient_id: recipient.id,
        role: "Frontend",
        note: marker,
      },
    },
    {
      table: "team_open_roles",
      values: { team_id: teamId, role: "Frontend", note: marker },
    },
    {
      table: "team_messages",
      values: { team_id: teamId, author_id: owner.id, body: marker },
    },
    {
      table: "team_checkins",
      values: {
        team_id: teamId,
        author_id: owner.id,
        week_start: new Date().toISOString().slice(0, 10),
        progress: marker,
        next_steps: marker,
        risk_level: "at_risk",
      },
    },
    {
      table: "team_ai_plans",
      values: {
        team_id: teamId,
        kind: "roadmap",
        input_hash: marker,
        model: "fuzz",
        plan: "{}",
        created_by: owner.id,
      },
    },
    {
      table: "team_deliverables",
      values: {
        team_id: teamId,
        kind: "source_code",
        title: marker,
        url: `https://example.test/${marker}`,
        created_by: owner.id,
      },
    },
    {
      table: "calendar_feed_tokens",
      values: {
        user_id: owner.id,
        token_hash: createHash("sha256").update(marker).digest("hex"),
      },
    },
    {
      table: "webhook_routes",
      values: {
        name: marker,
        target_url: `https://example.test/${marker}`,
        events: ["result.verified"],
      },
    },
    {
      table: "user_badges",
      values: {
        user_id: owner.id,
        badge_code: marker,
        evidence_count: 1,
      },
    },
  ];

  const checked: string[] = [];
  for (const spec of specs) {
    await seedRow(spec.table, spec.values);
    if (await assertNoCrossUserAccess(attacker.id, spec)) checked.push(spec.table);
  }

  assert.ok(checked.length > 0, "Wave 2 tables must be present for RLS fuzzing");
  console.log(`rls fuzz checked=${checked.join(",")}`);
});

test("CSRF ปฏิเสธ mutation ที่ไม่มี Origin และ Origin ไม่ตรง Host", async () => {
  const missingOrigin = await mutation("/api/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ full_name: "Fuzz User", skills: [] }),
  });
  assert.equal(missingOrigin.status, 403);

  const badOrigin = await mutation("/api/profile", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      origin: "https://evil.example",
    },
    body: JSON.stringify({ full_name: "Fuzz User", skills: [] }),
  });
  assert.equal(badOrigin.status, 403);

  const sameOrigin = await mutation("/api/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ full_name: "Fuzz User", skills: [] }),
  });
  assert.notEqual(sameOrigin.status, 403);
});

test("เซสชันที่ถูกเพิกถอน jti ต้องใช้เรียก API ไม่ได้", async () => {
  const user = await createUser("student");
  assert.ok(adminPool, "admin database pool is not configured");
  await adminPool.query(
    "UPDATE public.user_sessions SET revoked_at = now() WHERE jti = $1",
    [user.jti],
  );

  const response = await mutation("/api/profile", {
    headers: { cookie: `techhub_session=${user.token}` },
  });
  assert.equal(response.status, 401);

  const active = await createUser("student");
  const activeResponse = await mutation("/api/profile", {
    headers: { cookie: `techhub_session=${active.token}` },
  });
  assert.equal(activeResponse.status, 200);
});

test("AI endpoint ต้องตอบ 429 เมื่อเกิน rate limit", async () => {
  const user = await createUser("student");
  const key = `extract:user:${user.id}`;
  createdRateKeys.push(key);
  const statuses: number[] = [];

  for (let attempt = 0; attempt < 36; attempt += 1) {
    const response = await mutation("/api/ai/extract", {
      ...jsonMutationInit({
        mode: "text",
        text: "ข้อความทดสอบสำหรับตรวจสอบอัตราความถี่ของ AI endpoint",
      }),
      headers: {
        "content-type": "application/json",
        origin,
        cookie: `techhub_session=${user.token}`,
      },
    });
    statuses.push(response.status);
    if (statuses[statuses.length - 1] === 429) break;
  }

  assert.ok(
    statuses.includes(429),
    `AI rate limit was not enforced: ${statuses.join(",")}`,
  );
});

test("SSRF: บริการวิเคราะห์ต้องปฏิเสธ IP ส่วนตัวและ loopback", async () => {
  const user = await createUser("student");
  const targets = [
    "http://127.0.0.1:3100/api/health",
    "http://[::1]:3100/api/health",
    "http://169.254.169.254/latest/meta-data/",
  ];

  for (const url of targets) {
    const response = await mutation("/api/ai/extract", {
      ...jsonMutationInit({ mode: "url", url }),
      headers: {
        "content-type": "application/json",
        origin,
        cookie: `techhub_session=${user.token}`,
      },
    });
    assert.equal(response.status, 422, `SSRF target was not blocked: ${url}`);
    const body: unknown = await response.json();
    assert.equal(
      typeof body === "object" && body !== null && "error" in body,
      true,
    );
  }
});

test("SSRF: webhook targets ต้องถูกปฏิเสธก่อนบันทึก", async () => {
  const teacher = await createUser("teacher");
  const token = teacher.token;

  const response = await mutation("/api/admin/webhooks", {
    ...jsonMutationInit({
      name: marker,
      targetUrl: "http://127.0.0.1:3100/admin",
      events: ["result.verified"],
    }),
    headers: {
      "content-type": "application/json",
      origin,
      cookie: `techhub_session=${token}`,
    },
  });
  assert.equal(response.status, 400);
});

test("SSRF: deliverable links ต้องปฏิเสธ URL ภายใน", async () => {
  const user = await createUser("student");
  assert.ok(adminPool, "admin database pool is not configured");
  const competition = await adminPool.query<{ id: string }>(
    `INSERT INTO public.competitions
       (title, category, deadline, min_size, max_size, summary, source_url, source_type, status)
     VALUES ($1, 'Programming / Competitive', (current_date + interval '30 days')::date,
             1, 1, $2, $3, 'manual', 'open')
     RETURNING id`,
    [
      `Fuzz Deliverable ${marker}`,
      `fuzz ${marker}`,
      `https://example.test/deliverable-${marker}`,
    ],
  );
  const deliverableCompetitionId = competition.rows[0]?.id;
  assert.ok(deliverableCompetitionId);
  if (!competitionId) competitionId = deliverableCompetitionId;
  createdCompetitionIds.push(deliverableCompetitionId);
  const team = await adminPool.query<{ id: string }>(
    `INSERT INTO public.teams (competition_id, name, status)
     VALUES ($1, $2, 'draft') RETURNING id`,
    [deliverableCompetitionId, `Fuzz Deliverable Team ${marker}`],
  );
  const teamId = team.rows[0]?.id;
  assert.ok(teamId);
  await adminPool.query(
    `INSERT INTO public.team_members (team_id, user_id, assigned_role)
     VALUES ($1, $2, 'Frontend')`,
    [teamId, user.id],
  );
  await adminPool.query("UPDATE public.teams SET status = 'confirmed' WHERE id = $1", [teamId]);

  const response = await mutation(`/api/teams/${teamId}/deliverables`, {
    ...jsonMutationInit({
      kind: "source_code",
      title: "private",
      url: "http://169.254.169.254/latest/meta-data/",
    }),
    headers: {
      "content-type": "application/json",
      origin,
      cookie: `techhub_session=${user.token}`,
    },
  });
  assert.equal(response.status, 400);
});
