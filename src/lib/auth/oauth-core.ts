import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type OAuthProvider = "google" | "github";

export function isOAuthProvider(value: string): value is OAuthProvider {
  return value === "google" || value === "github";
}

export interface OAuthIdentity {
  provider: OAuthProvider;
  providerAccountId: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
  avatarUrl: string | null;
}

export const OAUTH_ERROR_CODES = [
  "provider_cancelled",
  "email_unverified",
  "oauth_failed",
] as const;

export type OAuthErrorCode = (typeof OAUTH_ERROR_CODES)[number];

export class OAuthCallbackError extends Error {
  readonly code: OAuthErrorCode;

  constructor(code: OAuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = "OAuthCallbackError";
    this.code = code;
  }
}

export const OAUTH_STATE_COOKIE = "techhub_oauth_state";
export const OAUTH_PKCE_COOKIE = "techhub_oauth_pkce";
export const OAUTH_COOKIE_MAX_AGE_SECONDS = 600;

function parseHttpUrl(raw: string, label: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${label} must be a valid absolute URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} must use http or https`);
  }
  return parsed;
}

function isLoopbackIp(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "127.0.0.1" || host === "::1";
}

export function getAppBaseUrl(request?: Request): string {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) {
    const parsed = parseHttpUrl(configured, "APP_BASE_URL");
    if (isLoopbackIp(parsed.hostname)) {
      throw new Error("APP_BASE_URL must not use a loopback IP address");
    }
    return parsed.href.replace(/\/+$/, "");
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_BASE_URL is required in production");
  }
  if (!request) {
    throw new Error("APP_BASE_URL is required when no request is available");
  }

  const parsed = parseHttpUrl(request.url, "request URL");
  if (isLoopbackIp(parsed.hostname)) {
    throw new Error(
      "APP_BASE_URL must be set when the request host is a loopback IP address",
    );
  }
  return parsed.origin;
}

export function generateOauthState(): string {
  return randomBytes(32).toString("base64url");
}

export function generatePkceVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function createPkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function oauthStateMatches(expected: string, received: string): boolean {
  const expectedDigest = createHash("sha256").update(expected).digest();
  const receivedDigest = createHash("sha256").update(received).digest();
  return timingSafeEqual(expectedDigest, receivedDigest);
}
