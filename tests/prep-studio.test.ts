import test from "node:test";
import assert from "node:assert/strict";
import {
  computeInputHash,
  decideWeekCount,
  deliverableInputSchema,
  parseRoadmapOutput,
  parseRubricReviewOutput,
  stableStringify,
} from "../src/lib/ai/prep-studio.ts";
import {
  calculateSubmissionReadiness,
  type TeamDeliverable,
  type TeamTaskSummary,
} from "../src/components/prep-studio/shared.ts";

test("canonical hashing ignores object key order but changes with context", () => {
  const left = { team: { id: "t1", name: "ทีม A" }, weekCount: 2 };
  const right = { weekCount: 2, team: { name: "ทีม A", id: "t1" } };

  assert.equal(stableStringify(left), stableStringify(right));
  assert.equal(computeInputHash(left), computeInputHash(right));
  assert.notEqual(computeInputHash(left), computeInputHash({ ...left, weekCount: 3 }));
});

test("week count follows the competition deadline", () => {
  assert.equal(decideWeekCount(null, "2026-01-05"), 4);
  assert.equal(decideWeekCount("2026-01-12", "2026-01-05"), 2);
  assert.equal(decideWeekCount("2026-02-20", "2026-01-05"), 6);
  assert.equal(decideWeekCount("2026-01-12", "2026-01-05", 4), 4);
});

test("roadmap output is validated, normalized to CE dates, and clamped to the deadline", () => {
  const plan = parseRoadmapOutput(
    {
      summary_th: "ทีมจะสร้างต้นแบบระบบจับคู่ทีมให้เสร็จก่อนปิดรับสมัคร",
      suggested_stack: ["Next.js", "PostgreSQL", "Next.js"],
      weeks: [
        {
          week: 2,
          title_th: "สัปดาห์สอง",
          focus_th: "สร้างต้นแบบและทดสอบผู้ใช้",
          tasks_th: ["เขียนหน้าค้นหาทีม", "", "ทดสอบกับนักเรียน 5 คน"],
          milestone_th: "ได้ต้นแบบที่ทดสอบได้จริง",
        },
        {
          week: 1,
          title_th: "สัปดาห์แรก",
          focus_th: "วิเคราะห์โจทย์และออกแบบโครงสร้าง",
          tasks_th: ["สรุปข้อกำหนดของโจทย์", "ออกแบบโครงข้อมูล"],
          milestone_th: "ได้แบบร่างโปรเจกต์ที่ทีมเห็นตรงกัน",
        },
      ],
      risks_th: ["สมาชิกไม่มีเวลาทดสอบ ควรแบ่งเวลาทดสอบล่วงหน้า"],
    },
    {
      weekCount: 2,
      todayIso: "2026-01-05",
      deadline: "2026-01-11",
      generatedAt: "2026-01-05T00:00:00.000Z",
    },
  );

  assert.equal(plan.kind, "roadmap");
  assert.deepEqual(plan.suggestedStack, ["Next.js", "PostgreSQL"]);
  assert.deepEqual(plan.weeks.map((week) => week.week), [1, 2]);
  assert.deepEqual(
    plan.weeks.map((week) => week.dueDate),
    ["2026-01-05", "2026-01-11"],
  );
  assert.equal(plan.weeks[0].tasksTh.length, 2);
});

test("roadmap output with the wrong week count is rejected", () => {
  assert.throws(
    () =>
      parseRoadmapOutput(
        {
          summary_th: "สรุป plan สำหรับทีมที่เริ่มต้นสร้างระบบใหม่ในสัปดาห์นี้",
          suggested_stack: ["Python"],
          weeks: [],
          risks_th: ["ควรกันเวลาทดสอบให้เพียงพอ"],
        },
        {
          weekCount: 2,
          todayIso: "2026-01-05",
          deadline: null,
          generatedAt: "2026-01-05T00:00:00.000Z",
        },
      ),
    /จำนวนสัปดาห์/,
  );
});

test("rubric output is validated and totals the canonical dimensions", () => {
  const plan = parseRubricReviewOutput(
    {
      summary_th: "ผลงานตรงกับโจทย์และมีโครงสร้างที่เข้าใจง่าย",
      scores: [
        { dimension_id: "problem_fit", score: 25, evidence_th: "โจทย์ถูกแยกเป็นข้อกำหนดชัดเจน", improvement_th: "เพิ่มตัวอย่างการใช้งานจริงในเอกสาร" },
        { dimension_id: "technical_quality", score: 20, evidence_th: "โค้ดแยกชั้นข้อมูลและ UI อย่างเหมาะสม", improvement_th: "เพิ่มชุดทดสอบสำหรับการจับคู่ทีม" },
        { dimension_id: "completeness", score: 15, evidence_th: "มีซอร์สโค้ดและเอกสารครบถ้วน", improvement_th: "เพิ่มวิดีโอสาธิตขั้นตอนการทำงาน" },
        { dimension_id: "presentation", score: 10, evidence_th: "เอกสารมีหัวข้ออ่านง่ายและเข้าใจได้", improvement_th: "สรุปสถาปัตยกรรมด้วยภาพประกอบ" },
        { dimension_id: "readiness", score: 10, evidence_th: "ยังขาดลิงก์วิดีโอสาธิตก่อนปิดรับ", improvement_th: "อัดคลิปสาธิตสั้น ๆ ก่อนส่งผลงาน" },
      ],
      top_improvements_th: [
        "อัดวิดีโอสาธิตการใช้งานให้เสร็จก่อนปิดรับ",
        "เพิ่มชุดทดสอบสำหรับฟังก์ชันจับคู่ทีม",
        "สรุปสถาปัตยกรรมระบบเป็นภาพประกอบในรายงาน",
      ],
      missing_items_th: ["วิดีโอสาธิต"],
      verdict_th: "ยังขาดวิดีโอสาธิต ควรเพิ่มก่อนส่ง",
    },
    { generatedAt: "2026-01-05T00:00:00.000Z" },
  );

  assert.equal(plan.kind, "rubric_review");
  assert.equal(plan.totalScore, 80);
  assert.deepEqual(
    plan.scores.map((score) => score.dimensionId),
    ["problem_fit", "technical_quality", "completeness", "presentation", "readiness"],
  );
});

test("rubric output with an out-of-range score is rejected", () => {
  const raw = {
    summary_th: "ผลงานโดยรวมมีทิศทางที่เข้าใจได้และเริ่มเห็นโครงสร้างชัดเจน",
    scores: [
      { dimension_id: "problem_fit", score: 99, evidence_th: "อธิบายโจทย์ได้เข้าใจง่ายมาก", improvement_th: "เพิ่มตัวอย่างการใช้งานจริงให้มากขึ้น" },
      { dimension_id: "technical_quality", score: 20, evidence_th: "แยกชั้นโค้ดออกจากกันอย่างเหมาะสม", improvement_th: "เขียนชุดทดสอบเพิ่มเติมให้ครอบคลุม" },
      { dimension_id: "completeness", score: 15, evidence_th: "มีเอกสารและซอร์สโค้ดที่อ่านได้", improvement_th: "เพิ่มลิงก์วิดีโอสาธิตให้ครบถ้วน" },
      { dimension_id: "presentation", score: 10, evidence_th: "รูปแบบเอกสารอ่านง่ายและสละสลวย", improvement_th: "เพิ่มภาพประกอบสถาปัตยกรรมระบบ" },
      { dimension_id: "readiness", score: 10, evidence_th: "เตรียมส่งได้เร็ว ๆ นี้", improvement_th: "ตรวจลิงก์ทั้งหมดอีกครั้งก่อนส่ง" },
    ],
    top_improvements_th: [
      "แก้ไขคะแนนด้านความตรงกับโจทย์ให้ถูกต้อง",
      "เพิ่มชุดทดสอบสำหรับฟังก์ชันหลักของระบบ",
      "อัดวิดีโอสาธิตก่อนปิดรับสมัคร",
    ],
    missing_items_th: [],
    verdict_th: "ควรแก้ไขคะแนนก่อนนำไปใช้จริง",
  };
  assert.throws(() => parseRubricReviewOutput(raw, { generatedAt: "2026-01-05T00:00:00.000Z" }), /คะแนน/);
});

test("readiness combines task completion and required deliverable links", () => {
  const tasks: TeamTaskSummary[] = [
    { id: "1", title: "วิเคราะห์โจทย์", status: "done", due_date: "2026-01-06" },
    { id: "2", title: "สร้างต้นแบบ", status: "doing", due_date: "2026-01-10" },
  ];
  const deliverables: TeamDeliverable[] = [
    {
      id: "d1",
      team_id: "team-1",
      title: "ซอร์สโค้ด",
      kind: "source_code",
      url: "https://example.com/repo",
      note: null,
      created_by: "u1",
      created_at: "2026-01-05T00:00:00.000Z",
      updated_at: "2026-01-05T00:00:00.000Z",
    },
    {
      id: "d2",
      team_id: "team-1",
      title: "รายงาน",
      kind: "document",
      url: "https://example.com/doc",
      note: null,
      created_by: "u1",
      created_at: "2026-01-05T00:00:00.000Z",
      updated_at: "2026-01-05T00:00:00.000Z",
    },
  ];

  const readiness = calculateSubmissionReadiness({
    tasks,
    deliverables,
    deadline: "2026-01-12",
    todayIso: "2026-01-05",
  });

  assert.equal(readiness.taskPoints, 25);
  assert.equal(readiness.deliverablePoints, 34);
  assert.equal(readiness.score, 59);
  assert.equal(readiness.level, "near");
  assert.deepEqual(
    readiness.checklist.map((item) => item.done),
    [false, true, true, false],
  );
  assert.equal(readiness.countdown.daysRemaining, 7);
});

test("deliverable validation blocks private URLs before any server fetch", () => {
  const valid = deliverableInputSchema.safeParse({
    title: "ซอร์สโค้ดของทีม",
    kind: "source_code",
    url: "https://github.com/school/team",
    note: null,
  });
  assert.equal(valid.success, true);

  for (const url of ["http://localhost:3000/admin", "http://127.0.0.1", "file:///etc/passwd"]) {
    const blocked = deliverableInputSchema.safeParse({
      title: "ซอร์สโค้ดของทีม",
      kind: "source_code",
      url,
      note: null,
    });
    assert.equal(blocked.success, false, `${url} ต้องถูกปฏิเสธ`);
  }
});
