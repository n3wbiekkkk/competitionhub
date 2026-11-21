import test from "node:test";
import assert from "node:assert/strict";
import {
  TEST_WEBHOOK_EVENT,
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_LABELS_TH,
} from "../src/lib/integrations/webhook-events.ts";
import {
  buildWebhookPayload,
  createWebhookRouteSchema,
  getWebhookSigningSecret,
  signWebhookPayload,
  validateWebhookTarget,
} from "../src/lib/integrations/webhooks.ts";

test("event vocabulary is closed and matches migration 0013", () => {
  assert.deepEqual([...WEBHOOK_EVENTS], [
    "result.verified",
    "team.confirmed",
    "competition.opened",
  ]);
  assert.equal(TEST_WEBHOOK_EVENT, "webhook.test");
  for (const event of WEBHOOK_EVENTS) {
    assert.ok(WEBHOOK_EVENT_LABELS_TH[event].length > 0);
  }
});

test("route input validation rejects unknown or empty events", () => {
  assert.equal(
    createWebhookRouteSchema.safeParse({
      name: "school",
      targetUrl: "https://example.com/hook",
      events: ["anything.else"],
    }).success,
    false,
  );
  assert.equal(
    createWebhookRouteSchema.safeParse({
      name: "school",
      targetUrl: "https://example.com/hook",
      events: [],
    }).success,
    false,
  );
  assert.equal(
    createWebhookRouteSchema.safeParse({
      name: "school",
      targetUrl: "https://example.com/hook",
      events: ["result.verified"],
    }).success,
    true,
  );
});

test("webhook targets use the shared SSRF guard and reject fragments", () => {
  assert.equal(
    validateWebhookTarget(" https://hooks.example.com/techcomp "),
    "https://hooks.example.com/techcomp",
  );
  for (const unsafe of [
    "http://127.0.0.1/hook",
    "http://localhost/hook",
    "http://169.254.169.254/latest/meta-data",
    "http://192.168.1.10/hook",
    "http://[::1]/hook",
    "file:///etc/passwd",
    "https://user:pass@example.com/hook",
    "https://example.com/hook#secret",
  ]) {
    assert.throws(() => validateWebhookTarget(unsafe), undefined, unsafe);
  }
});

test("payloads contain no signing key and signatures are deterministic", () => {
  const payload = buildWebhookPayload({
    id: "11111111-1111-4111-8111-111111111111",
    event: "result.verified",
    data: { resultId: "result-1" },
    occurredAt: new Date("2026-03-04T05:06:07.000Z"),
  });
  assert.deepEqual(payload, {
    id: "11111111-1111-4111-8111-111111111111",
    event: "result.verified",
    created_at: "2026-03-04T05:06:07.000Z",
    data: { resultId: "result-1" },
  });
  assert.ok(!JSON.stringify(payload).includes("secret"));

  const body = JSON.stringify(payload);
  const first = signWebhookPayload("unit-test-signing-key", body);
  assert.equal(first, signWebhookPayload("unit-test-signing-key", body));
  assert.match(first, /^sha256=[a-f0-9]{64}$/);
  assert.notEqual(first, signWebhookPayload("another-signing-key", body));
});

test("signing secret is required from the environment, never a default", () => {
  const original = process.env.WEBHOOK_SIGNING_SECRET;
  try {
    delete process.env.WEBHOOK_SIGNING_SECRET;
    assert.throws(() => getWebhookSigningSecret());
    process.env.WEBHOOK_SIGNING_SECRET = "long-enough-environment-secret";
    assert.equal(
      getWebhookSigningSecret(),
      "long-enough-environment-secret",
    );
  } finally {
    if (original === undefined) {
      delete process.env.WEBHOOK_SIGNING_SECRET;
    } else {
      process.env.WEBHOOK_SIGNING_SECRET = original;
    }
  }
});
