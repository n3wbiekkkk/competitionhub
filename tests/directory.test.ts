import test from "node:test";
import assert from "node:assert/strict";
import { consumeRateLimit, clearRateLimitForTests } from "../src/lib/utils/rate-limit.ts";
import { getInitials } from "../src/lib/utils/initials.ts";

test("rate limit allows the first requests then blocks a burst", () => {
  clearRateLimitForTests();
  const now = 1_000_000;
  assert.equal(consumeRateLimit("user-1", now, 2, 60_000).allowed, true);
  assert.equal(consumeRateLimit("user-1", now, 2, 60_000).allowed, true);
  const blocked = consumeRateLimit("user-1", now, 2, 60_000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 1);
});

test("rate limit window resets", () => {
  clearRateLimitForTests();
  const now = 1_000_000;
  consumeRateLimit("user-2", now, 1, 1_000);
  assert.equal(consumeRateLimit("user-2", now + 1_001, 1, 1_000).allowed, true);
});

test("initials work for Thai names and fallback email", () => {
  assert.equal(getInitials("สมชาย ใจดี", "a@b.com"), "สใ");
  assert.equal(getInitials("", "newbie@example.com"), "NE");
  assert.equal(getInitials("", ""), "TC");
});
