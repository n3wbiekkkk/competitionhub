import test from "node:test";
import assert from "node:assert/strict";
import { rateLimitDecision } from "../src/lib/auth/rate-limit.ts";
import { getInitials } from "../src/lib/utils/initials.ts";

test("rate limit allows requests within the window and blocks the next", () => {
  assert.deepEqual(rateLimitDecision(1, 2, 45), {
    allowed: true,
    remaining: 1,
    retryAfterSeconds: 45,
  });
  assert.deepEqual(rateLimitDecision(2, 2, 30), {
    allowed: true,
    remaining: 0,
    retryAfterSeconds: 30,
  });
  assert.deepEqual(rateLimitDecision(3, 2, 12), {
    allowed: false,
    remaining: 0,
    retryAfterSeconds: 12,
  });
});

test("initials work for Thai names and fallback email", () => {
  assert.equal(getInitials("สมชาย ใจดี", "a@b.com"), "สใ");
  assert.equal(getInitials("", "newbie@example.com"), "NE");
  assert.equal(getInitials("", ""), "TC");
});
