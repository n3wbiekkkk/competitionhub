import test from "node:test";
import assert from "node:assert/strict";
import { redactLogFields } from "../src/lib/utils/logger.ts";
import { isAllowedMutationOrigin } from "../src/lib/auth/csrf.ts";
import { getRequestIp } from "../src/lib/utils/request-ip.ts";

test("logger redacts secrets but keeps ordinary fields", () => {
  const result = redactLogFields({
    requestId: "req-1",
    password: "secret-value",
    authorization: "Bearer secret",
    TYPHOON_API_KEY: "secret",
    route: "/api/auth/login",
  });
  assert.equal(result.requestId, "req-1");
  assert.equal(result.route, "/api/auth/login");
  assert.equal(result.password, "[REDACTED]");
  assert.equal(result.authorization, "[REDACTED]");
  assert.equal(result.TYPHOON_API_KEY, "[REDACTED]");
});

test("logger redacts nested fields and secret-bearing error text", () => {
  const result = redactLogFields({
    error: {
      name: "Error",
      message: "request failed with Authorization: Bearer secret-value",
      context: { password: "another-secret", safe: "ok" },
    },
  });
  const nested = result.error as Record<string, unknown>;
  const context = nested.context as Record<string, unknown>;
  assert.equal(nested.message, "[REDACTED]");
  assert.equal(context.password, "[REDACTED]");
  assert.equal(context.safe, "ok");
});

test("request IP ignores client headers unless a trusted proxy is configured", () => {
  const original = process.env.TRUST_PROXY_HEADERS;
  const request = new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.9", "x-real-ip": "203.0.113.10" },
  });

  try {
    delete process.env.TRUST_PROXY_HEADERS;
    assert.equal(getRequestIp(request), "direct");
    process.env.TRUST_PROXY_HEADERS = "true";
    assert.equal(getRequestIp(request), "203.0.113.9");
  } finally {
    if (original === undefined) delete process.env.TRUST_PROXY_HEADERS;
    else process.env.TRUST_PROXY_HEADERS = original;
  }
});

test("CSRF accepts same-origin and non-browser writes", () => {
  assert.equal(
    isAllowedMutationOrigin(new Request("http://localhost:3000/api/profile", {
      method: "POST",
      headers: { host: "localhost:3000", origin: "http://localhost:3000" },
    })),
    true,
  );
  assert.equal(
    isAllowedMutationOrigin(new Request("http://localhost:3000/api/profile", {
      method: "POST",
      headers: { host: "localhost:3000" },
    })),
    true,
  );
});

test("CSRF rejects cross-origin and null-origin writes", () => {
  assert.equal(
    isAllowedMutationOrigin(new Request("http://localhost:3000/api/profile", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    })),
    false,
  );
  assert.equal(
    isAllowedMutationOrigin(new Request("http://localhost:3000/api/profile", {
      method: "POST",
      headers: { host: "localhost:3000", origin: "null" },
    })),
    false,
  );
});
