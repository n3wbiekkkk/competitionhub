import assert from "node:assert/strict";
import test from "node:test";
import { nextRetryDelay, normalizeCursor } from "@/lib/realtime/cursor";
import { safeHttpUrl } from "@/lib/realtime/link-safety";
import { extractMentionIds } from "@/lib/realtime/mentions";
import { parseSafeSegments } from "@/lib/realtime/markdown";
import {
  advanceCursor,
  dedupeEvents,
  encodeSseFrame,
  parseRealtimeEvent,
  shouldDeliverEvent,
} from "@/lib/realtime/protocol";
import { formatWeekRangeTh, getWeekStartIso } from "@/lib/realtime/week";
import type { RealtimeEvent } from "@/lib/realtime/types";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const TEAM_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_TEAM_ID = "44444444-4444-4444-8444-444444444444";
const CREATED_AT = "2026-11-21T10:00:00.000Z";
const LATER_AT = "2026-11-21T10:00:05.000Z";

function notificationEvent(): RealtimeEvent {
  return {
    kind: "notification",
    id: "notification:abc",
    userId: USER_ID,
    title: "มีข้อความใหม่",
    body: "@นุ่น สวัสดี",
    href: "/my-teams",
    createdAt: CREATED_AT,
  };
}

function messageEvent(): RealtimeEvent {
  return {
    kind: "team_message",
    id: "message:def",
    teamId: TEAM_ID,
    authorId: OTHER_USER_ID,
    preview: "สวัสดีทีม",
    createdAt: LATER_AT,
  };
}

test("SSE frames carry an id, an event name and parseable JSON data", () => {
  const frame = encodeSseFrame(notificationEvent());
  assert.match(frame, /^id: notification:abc\n/);
  assert.match(frame, /event: update\n/);
  const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));
  assert.ok(dataLine);
  assert.deepEqual(JSON.parse(dataLine.slice("data: ".length)), notificationEvent());
  assert.match(encodeSseFrame({ kind: "heartbeat", id: "hb", at: CREATED_AT }), /event: heartbeat/);
});

test("event parsing rejects malformed and invalid payloads", () => {
  assert.equal(parseRealtimeEvent("not-json"), null);
  assert.equal(parseRealtimeEvent(JSON.stringify({ kind: "notification" })), null);
  assert.deepEqual(parseRealtimeEvent(JSON.stringify(notificationEvent())), notificationEvent());
});

test("delivery is scoped to the recipient and their teams", () => {
  const context = { userId: USER_ID, teamIds: new Set([TEAM_ID]) };
  assert.equal(shouldDeliverEvent(notificationEvent(), context), true);
  assert.equal(
    shouldDeliverEvent({ ...notificationEvent(), userId: OTHER_USER_ID }, context),
    false,
  );
  assert.equal(shouldDeliverEvent(messageEvent(), context), true);
  assert.equal(
    shouldDeliverEvent({ ...messageEvent(), teamId: OTHER_TEAM_ID }, context),
    false,
  );
  assert.equal(shouldDeliverEvent({ kind: "ready", id: "r", at: CREATED_AT }, context), true);
});

test("dedupe and cursor advancement keep the stream monotonic", () => {
  const first = notificationEvent();
  const second = messageEvent();
  const seen = new Set<string>();
  const result = dedupeEvents([first, second, first], seen);
  assert.deepEqual(result.events.map((event) => event.id), [first.id, second.id]);
  assert.equal(seen.size, 0);
  assert.equal(result.seen.size, 2);
  assert.equal(advanceCursor(CREATED_AT, result.events), LATER_AT);
  assert.equal(advanceCursor(LATER_AT, result.events), LATER_AT);
});

test("cursors default to a recent bounded window and retries back off", () => {
  const now = new Date("2026-11-21T12:00:00.000Z");
  assert.equal(normalizeCursor(LATER_AT, now), LATER_AT);
  assert.equal(normalizeCursor("2569-11-21", now), "2026-11-21T11:59:30.000Z");
  assert.equal(normalizeCursor(null, now), "2026-11-21T11:59:30.000Z");
  assert.equal(nextRetryDelay(1), 1_000);
  assert.equal(nextRetryDelay(2), 2_000);
  assert.equal(nextRetryDelay(20), 15_000);
});

test("mentions resolve only against the confirmed roster", () => {
  const members = [
    { id: USER_ID, fullName: "สมชาย ใจดี", nickname: "นุ่น" },
    { id: OTHER_USER_ID, fullName: "วิชัย รักดี", nickname: "วิช" },
  ];
  assert.deepEqual(
    extractMentionIds("สวัสดี @นุ่น และ @วิชัย รักดี รวมถึง foo@example.com", members),
    [USER_ID, OTHER_USER_ID],
  );
  assert.deepEqual(extractMentionIds("ไม่มี @คนนอกในทีม", members), []);
});

test("markdown rendering keeps only validated links and safe text", () => {
  const members = [{ id: USER_ID, fullName: "สมชาย ใจดี", nickname: "นุ่น" }];
  assert.equal(safeHttpUrl("javascript:alert(1)"), null);
  assert.equal(safeHttpUrl("https://127.0.0.1/"), null);
  assert.equal(safeHttpUrl("https://example.com/docs"), "https://example.com/docs");

  const segments = parseSafeSegments(
    "@นุ่น ดู [เอกสาร](https://example.com/docs) หรือ https://example.org อย่า [ทำ](javascript:alert(1)) <script>",
    members,
  );
  assert.deepEqual(
    segments.map((segment) => segment.kind),
    ["mention", "text", "link", "text", "link", "text"],
  );
  const firstLink = segments.find((segment) => segment.kind === "link");
  assert.ok(firstLink && firstLink.kind === "link");
  assert.equal(firstLink.href, "https://example.com/docs");
  assert.match(segments.map((segment) => ("text" in segment ? segment.text : "")).join(""), /<script>/);
});

test("weekly check-ins use Monday CE dates and Thai BE labels", () => {
  assert.equal(getWeekStartIso("2026-11-25"), "2026-11-23");
  assert.equal(getWeekStartIso("2026-11-23"), "2026-11-23");
  assert.match(formatWeekRangeTh("2026-11-23"), /2569/);
});
