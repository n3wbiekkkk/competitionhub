import { randomUUID } from "node:crypto";
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
  jti: z.string().uuid(),
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

export async function signSessionToken(
  payload: SessionUser,
  sessionVersion = 0,
  jti = randomUUID(),
): Promise<string> {
  const secretKey = getSessionSecretKey();
  if (!secretKey) {
    throw new Error(
      "SESSION_SECRET is not configured or shorter than 16 characters.",
    );
  }

  const validated = sessionPayloadSchema.parse({
    ...payload,
    sv: sessionVersion,
    jti,
  });

  return new SignJWT({
    email: validated.email,
    role: validated.role,
    fullName: validated.fullName,
    sv: validated.sv,
    jti: validated.jti,
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
  jti: string;
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
      jti: payload.jti,
    });

    if (!parsed.success) {
      return null;
    }

    const { sv, jti, ...user } = parsed.data;
    return { user, sessionVersion: sv, jti };
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
