import test from "node:test";
import assert from "node:assert/strict";
import {
  getAppBaseUrl,
  createPkceChallenge,
  oauthStateMatches,
  generateOauthState,
  generatePkceVerifier,
} from "../src/lib/auth/oauth-core.ts";

// Exports from src/lib/auth/oauth-core.ts:
//   getAppBaseUrl(request?: Request): string
//   createPkceChallenge(verifier: string): string
//   oauthStateMatches(expected: string, received: string): boolean
//   generateOauthState(): string
//   generatePkceVerifier(): string

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("getAppBaseUrl uses APP_BASE_URL when it is an https URL", () => {
  const original = process.env.APP_BASE_URL;
  try {
    process.env.APP_BASE_URL = "https://pbcomphub.dpdns.org";
    assert.equal(getAppBaseUrl(), "https://pbcomphub.dpdns.org");
  } finally {
    restoreEnv("APP_BASE_URL", original);
  }
});

test("getAppBaseUrl normalizes a trailing slash", () => {
  const original = process.env.APP_BASE_URL;
  try {
    process.env.APP_BASE_URL = "https://pbcomphub.dpdns.org/";
    assert.equal(getAppBaseUrl(), "https://pbcomphub.dpdns.org");
  } finally {
    restoreEnv("APP_BASE_URL", original);
  }
});

test("getAppBaseUrl refuses the localhost fallback in production", () => {
  const originalBaseUrl = process.env.APP_BASE_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  try {
    delete process.env.APP_BASE_URL;
    process.env.NODE_ENV = "production";
    assert.throws(() => getAppBaseUrl());
  } finally {
    restoreEnv("APP_BASE_URL", originalBaseUrl);
    restoreEnv("NODE_ENV", originalNodeEnv);
  }
});

test("createPkceChallenge is deterministic and matches the RFC 7636 S256 vector", () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const expectedChallenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

  assert.equal(createPkceChallenge(verifier), expectedChallenge);
  assert.equal(createPkceChallenge(verifier), createPkceChallenge(verifier));
  assert.match(createPkceChallenge(verifier), /^[A-Za-z0-9_-]+$/);
});

test("oauthStateMatches returns a boolean that rejects mismatches", () => {
  assert.equal(oauthStateMatches("expected-state", "expected-state"), true);
  assert.equal(oauthStateMatches("expected-state", "attacker-state"), false);
});

test("generateOauthState and generatePkceVerifier return distinct url-safe values", () => {
  const stateA = generateOauthState();
  const stateB = generateOauthState();
  const verifierA = generatePkceVerifier();
  const verifierB = generatePkceVerifier();

  for (const value of [stateA, stateB, verifierA, verifierB]) {
    assert.match(value, /^[A-Za-z0-9_-]+$/);
    assert.ok(value.length >= 16);
  }
  assert.notEqual(stateA, stateB);
  assert.notEqual(verifierA, verifierB);
});
