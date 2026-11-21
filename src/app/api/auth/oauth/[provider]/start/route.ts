import { NextResponse, type NextRequest } from "next/server";
import {
  buildAuthorizationUrl,
  createOAuthErrorRedirect,
  generateOauthState,
  generatePkceVerifier,
  isOAuthProvider,
  OAUTH_PKCE_COOKIE,
  OAUTH_STATE_COOKIE,
  setOAuthCookie,
} from "@/lib/auth/oauth";
import { logError } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  if (!isOAuthProvider(provider)) {
    return createOAuthErrorRedirect(request, "oauth_failed");
  }

  try {
    const state = generateOauthState();
    const pkceVerifier = provider === "google" ? generatePkceVerifier() : null;
    const authorizationUrl = buildAuthorizationUrl(
      provider,
      state,
      pkceVerifier,
      request,
    );

    const response = NextResponse.redirect(authorizationUrl, 302);
    setOAuthCookie(response, OAUTH_STATE_COOKIE, state);
    if (pkceVerifier) {
      setOAuthCookie(response, OAUTH_PKCE_COOKIE, pkceVerifier);
    }
    return response;
  } catch (error) {
    logError(`[auth/oauth/${provider}/start] error:`, error);
    return createOAuthErrorRedirect(request, "oauth_failed");
  }
}
