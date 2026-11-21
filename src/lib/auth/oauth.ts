import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { shouldUseSecureCookie } from "@/lib/auth/cookies";
import {
  createPkceChallenge,
  getAppBaseUrl,
  OAuthCallbackError,
  OAUTH_COOKIE_MAX_AGE_SECONDS,
  OAUTH_PKCE_COOKIE,
  OAUTH_STATE_COOKIE,
  type OAuthErrorCode,
  type OAuthIdentity,
  type OAuthProvider,
} from "@/lib/auth/oauth-core";
import { hashPassword } from "@/lib/auth/password";
import { userRoleSchema, type UserRole } from "@/lib/constants/tech-taxonomy";
import { withSystemDb } from "@/lib/db/pool";
import type { SessionUser } from "@/types/database";

export {
  createPkceChallenge,
  generateOauthState,
  generatePkceVerifier,
  getAppBaseUrl,
  isOAuthProvider,
  OAUTH_COOKIE_MAX_AGE_SECONDS,
  OAUTH_ERROR_CODES,
  OAUTH_PKCE_COOKIE,
  OAUTH_STATE_COOKIE,
  OAuthCallbackError,
  oauthStateMatches,
  type OAuthErrorCode,
  type OAuthIdentity,
  type OAuthProvider,
} from "@/lib/auth/oauth-core";

export function setOAuthCookie(
  response: NextResponse,
  name: string,
  value: string,
): void {
  response.cookies.set({
    name,
    value,
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(),
    path: "/",
    maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
  });
}

export function clearOAuthCookies(response: NextResponse): void {
  response.cookies.delete(OAUTH_STATE_COOKIE);
  response.cookies.delete(OAUTH_PKCE_COOKIE);
}

interface OAuthProviderConfig {
  readonly authorizationUrl: string;
  readonly tokenUrl: string;
  readonly userInfoUrl: string;
  readonly emailsUrl?: string;
  readonly scope: string;
  readonly clientIdEnv: string;
  readonly clientSecretEnv: string;
  readonly usesPkce: boolean;
}

const OAUTH_PROVIDER_CONFIG: Readonly<Record<OAuthProvider, OAuthProviderConfig>> = {
  google: {
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    usesPkce: true,
  },
  github: {
    authorizationUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    emailsUrl: "https://api.github.com/user/emails",
    scope: "read:user user:email",
    clientIdEnv: "GITHUB_CLIENT_ID",
    clientSecretEnv: "GITHUB_CLIENT_SECRET",
    usesPkce: false,
  },
};

export function getOAuthProviderConfig(
  provider: OAuthProvider,
): OAuthProviderConfig {
  return OAUTH_PROVIDER_CONFIG[provider];
}

export function getOAuthRedirectUri(
  provider: OAuthProvider,
  request?: Request,
): string {
  return `${getAppBaseUrl(request)}/api/auth/callback/${provider}`;
}

export function buildAuthorizationUrl(
  provider: OAuthProvider,
  state: string,
  pkceVerifier: string | null,
  request?: Request,
): string {
  const config = getOAuthProviderConfig(provider);
  const clientId = process.env[config.clientIdEnv]?.trim();
  if (!clientId) {
    throw new Error(`${provider} OAuth client ID is not configured`);
  }

  const url = new URL(config.authorizationUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", getOAuthRedirectUri(provider, request));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("state", state);
  if (config.usesPkce) {
    if (!pkceVerifier) {
      throw new Error(`${provider} OAuth requires a PKCE verifier`);
    }
    url.searchParams.set("code_challenge", createPkceChallenge(pkceVerifier));
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

export function createOAuthErrorRedirect(
  request: Request,
  code: OAuthErrorCode,
): NextResponse {
  const url = new URL("/login", getAppBaseUrl(request));
  url.searchParams.set("error", code);
  const response = NextResponse.redirect(url, 302);
  clearOAuthCookies(response);
  return response;
}

export function createOAuthSuccessRedirect(request: Request): NextResponse {
  const response = NextResponse.redirect(new URL("/", getAppBaseUrl(request)), 302);
  clearOAuthCookies(response);
  return response;
}

const googleTokenSchema = z.object({
  access_token: z.string().min(1).optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

const googleUserInfoSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  email_verified: z.boolean(),
  name: z.string().nullable().optional(),
  picture: z.string().url().nullable().optional(),
});

const githubTokenSchema = z.object({
  access_token: z.string().min(1).optional(),
  token_type: z.string().optional(),
  scope: z.string().optional(),
  expires_in: z.number().int().nonnegative().optional(),
  refresh_token: z.string().optional(),
  refresh_token_expires_in: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

const githubUserSchema = z.object({
  id: z.number().int().positive(),
  login: z.string().optional(),
  name: z.string().nullable().optional(),
  avatar_url: z.string().url().nullable().optional(),
});

const githubEmailSchema = z.array(
  z.object({
    email: z.string().email(),
    primary: z.boolean(),
    verified: z.boolean(),
  }),
);

async function readProviderJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new OAuthCallbackError("oauth_failed");
  }
}

function getOAuthCredentials(provider: OAuthProvider): {
  clientId: string;
  clientSecret: string;
} {
  const config = getOAuthProviderConfig(provider);
  const clientId = process.env[config.clientIdEnv]?.trim();
  const clientSecret = process.env[config.clientSecretEnv]?.trim();
  if (!clientId || !clientSecret) {
    throw new Error(`${provider} OAuth credentials are not configured`);
  }
  return { clientId, clientSecret };
}

export async function fetchGoogleIdentity(
  request: Request,
  code: string,
  pkceVerifier: string,
): Promise<OAuthIdentity> {
  const { clientId, clientSecret } = getOAuthCredentials("google");
  const config = getOAuthProviderConfig("google");

  const tokenResponse = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getOAuthRedirectUri("google", request),
      grant_type: "authorization_code",
      code_verifier: pkceVerifier,
    }),
    cache: "no-store",
  });
  if (!tokenResponse.ok) {
    throw new OAuthCallbackError("oauth_failed");
  }

  const token = googleTokenSchema.safeParse(await readProviderJson(tokenResponse));
  if (!token.success || !token.data.access_token) {
    throw token.success && token.data.error === "access_denied"
      ? new OAuthCallbackError("provider_cancelled")
      : new OAuthCallbackError("oauth_failed");
  }

  const infoResponse = await fetch(config.userInfoUrl, {
    headers: { authorization: `Bearer ${token.data.access_token}` },
    cache: "no-store",
  });
  if (!infoResponse.ok) {
    throw new OAuthCallbackError("oauth_failed");
  }

  const info = googleUserInfoSchema.safeParse(await readProviderJson(infoResponse));
  if (!info.success) {
    throw new OAuthCallbackError("oauth_failed");
  }
  if (info.data.email_verified !== true) {
    throw new OAuthCallbackError("email_unverified");
  }

  return {
    provider: "google",
    providerAccountId: info.data.sub,
    email: info.data.email.toLowerCase(),
    emailVerified: true,
    displayName: info.data.name?.trim() || null,
    avatarUrl: info.data.picture ?? null,
  };
}

export async function fetchGithubIdentity(
  request: Request,
  code: string,
): Promise<OAuthIdentity> {
  const { clientId, clientSecret } = getOAuthCredentials("github");
  const config = getOAuthProviderConfig("github");

  const tokenResponse = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: getOAuthRedirectUri("github", request),
    }),
    cache: "no-store",
  });
  if (!tokenResponse.ok) {
    throw new OAuthCallbackError("oauth_failed");
  }

  const token = githubTokenSchema.safeParse(await readProviderJson(tokenResponse));
  if (!token.success || !token.data.access_token) {
    throw token.success && token.data.error === "access_denied"
      ? new OAuthCallbackError("provider_cancelled")
      : new OAuthCallbackError("oauth_failed");
  }

  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token.data.access_token}`,
    "user-agent": "techcomp-hub",
  };
  const userResponse = await fetch(config.userInfoUrl, {
    headers,
    cache: "no-store",
  });
  if (!config.emailsUrl) {
    throw new OAuthCallbackError("oauth_failed");
  }
  const emailsResponse = await fetch(config.emailsUrl, {
    headers,
    cache: "no-store",
  });
  if (!userResponse.ok || !emailsResponse.ok) {
    throw new OAuthCallbackError("oauth_failed");
  }

  const user = githubUserSchema.safeParse(await readProviderJson(userResponse));
  const emails = githubEmailSchema.safeParse(await readProviderJson(emailsResponse));
  if (!user.success || !emails.success) {
    throw new OAuthCallbackError("oauth_failed");
  }

  const verifiedEmail = emails.data.find(
    (entry) => entry.primary && entry.verified,
  );
  if (!verifiedEmail) {
    throw new OAuthCallbackError(
      "email_unverified",
      "ไม่พบอีเมลหลักที่ยืนยันตัวตนแล้วในบัญชี GitHub",
    );
  }

  return {
    provider: "github",
    providerAccountId: String(user.data.id),
    email: verifiedEmail.email.toLowerCase(),
    emailVerified: true,
    displayName: user.data.name?.trim() || user.data.login?.trim() || null,
    avatarUrl: user.data.avatar_url ?? null,
  };
}

export interface LinkedOAuthAccount {
  user: SessionUser;
  sessionVersion: number;
}

interface LinkedAccountRow {
  id: string;
  email: string;
  role: UserRole;
  full_name: string;
  session_version: number;
}

const LINKED_ACCOUNT_SELECT = `
  SELECT a.id, a.email, p.full_name, p.role,
         coalesce(
           (SELECT s.session_version FROM public.auth_security s WHERE s.user_id = a.id),
           0
         )::int AS session_version
  FROM public.auth_accounts a
  JOIN public.profiles p ON p.id = a.id
`;

function toLinkedAccount(row: LinkedAccountRow): LinkedOAuthAccount {
  return {
    user: {
      id: row.id,
      email: row.email,
      role: userRoleSchema.parse(row.role),
      fullName: row.full_name,
    },
    sessionVersion: row.session_version,
  };
}

export async function linkOAuthAccount(
  identity: OAuthIdentity,
): Promise<LinkedOAuthAccount> {
  if (!identity.emailVerified) {
    throw new OAuthCallbackError("email_unverified");
  }
  const email = identity.email.trim().toLowerCase();
  if (!email) {
    throw new OAuthCallbackError("oauth_failed");
  }

  return withSystemDb(async (client) => {
    const linked = await client.query<LinkedAccountRow>(
      `${LINKED_ACCOUNT_SELECT}
       JOIN public.oauth_accounts o ON o.user_id = a.id
       WHERE o.provider = $1 AND o.provider_account_id = $2
       LIMIT 1`,
      [identity.provider, identity.providerAccountId],
    );
    const existingLink = linked.rows[0];
    if (existingLink) {
      return toLinkedAccount(existingLink);
    }

    const byEmail = await client.query<LinkedAccountRow>(
      `${LINKED_ACCOUNT_SELECT} WHERE lower(a.email) = lower($1) LIMIT 1`,
      [email],
    );
    let account = byEmail.rows[0];

    if (!account) {
      await client.query("SELECT pg_advisory_xact_lock(742901)");
      const recheck = await client.query<LinkedAccountRow>(
        `${LINKED_ACCOUNT_SELECT} WHERE lower(a.email) = lower($1) LIMIT 1`,
        [email],
      );
      account = recheck.rows[0];

      if (!account) {
        const passwordHash = await hashPassword(
          randomBytes(48).toString("base64url"),
        );
        const created = await client.query<{ id: string }>(
          `INSERT INTO public.auth_accounts (email, password_hash)
           VALUES ($1, $2)
           RETURNING id`,
          [email, passwordHash],
        );
        const userId = created.rows[0]?.id;
        if (!userId) {
          throw new Error("Failed to create OAuth auth account");
        }

        const displayName =
          identity.displayName?.trim() || email.split("@")[0] || "ผู้ใช้";
        await client.query(
          `INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
           VALUES ($1, $2, $3, $4, 'student')`,
          [userId, email, displayName, identity.avatarUrl],
        );
        await client.query(
          `INSERT INTO public.auth_security (user_id, session_version)
           VALUES ($1, 0)
           ON CONFLICT (user_id) DO NOTHING`,
          [userId],
        );

        const reloaded = await client.query<LinkedAccountRow>(
          `${LINKED_ACCOUNT_SELECT} WHERE a.id = $1 LIMIT 1`,
          [userId],
        );
        account = reloaded.rows[0];
        if (!account) {
          throw new Error("Failed to load OAuth account profile");
        }
      }
    }

    await client.query(
      `INSERT INTO public.oauth_accounts (user_id, provider, provider_account_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (provider, provider_account_id) DO NOTHING`,
      [account.id, identity.provider, identity.providerAccountId],
    );

    return toLinkedAccount(account);
  });
}
