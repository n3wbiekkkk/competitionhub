import test from "node:test";
import assert from "node:assert/strict";
import { redactLogFields } from "../src/lib/utils/logger.ts";
import { isAllowedMutationOrigin } from "../src/lib/auth/csrf.ts";

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
      headers: { host: "localhost:3000", origin: "https://evil.example" },
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
