import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { z } from "zod";
import { userRoleSchema } from "@/lib/constants/tech-taxonomy";
import type { SessionUser } from "@/types/database";

export const SESSION_COOKIE_NAME = "techhub_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const sessionPayloadSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: userRoleSchema,
  fullName: z.string(),
  sv: z.number().int().nonnegative(),
});

function getSessionSecretKey(): Uint8Array | null {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 16) {
    return null;
  }
  return new TextEncoder().encode(secret);
}

export function isSessionSecretConfigured(): boolean {
  return getSessionSecretKey() !== null;
}

/**
 * Mints a session token. `sessionVersion` comes from public.auth_security and
 * is re-checked against the database on every authenticated read, so changing
 * a password or role can revoke tokens that were already handed out.
 */
export async function signSessionToken(
  payload: SessionUser,
  sessionVersion = 0,
): Promise<string> {
  const secretKey = getSessionSecretKey();
  if (!secretKey) {
    throw new Error(
      "SESSION_SECRET is not configured or shorter than 16 characters.",
    );
  }

  const validated = sessionPayloadSchema.parse({ ...payload, sv: sessionVersion });

  return new SignJWT({
    email: validated.email,
    role: validated.role,
    fullName: validated.fullName,
    sv: validated.sv,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(validated.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey);
}

export interface VerifiedSession {
  user: SessionUser;
  sessionVersion: number;
}

export async function verifySessionToken(
  token: string,
): Promise<VerifiedSession | null> {
  const secretKey = getSessionSecretKey();
  if (!secretKey || !token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ["HS256"],
    });

    const parsed = sessionPayloadSchema.safeParse({
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      fullName: payload.fullName ?? "",
      sv: payload.sv ?? 0,
    });

    if (!parsed.success) {
      return null;
    }

    const { sv, ...user } = parsed.data;
    return { user, sessionVersion: sv };
  } catch {
    return null;
  }
}

export async function getCurrentSession(): Promise<VerifiedSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }
  return verifySessionToken(token);
}
