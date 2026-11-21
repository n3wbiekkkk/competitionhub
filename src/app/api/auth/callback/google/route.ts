import type { NextRequest } from "next/server";
import {
  createOAuthErrorRedirect,
  createOAuthSuccessRedirect,
  fetchGoogleIdentity,
  linkOAuthAccount,
  OAUTH_PKCE_COOKIE,
  OAUTH_STATE_COOKIE,
  OAuthCallbackError,
  oauthStateMatches,
} from "@/lib/auth/oauth";
import { issueSessionCookie } from "@/lib/auth/session-issue";
import { logError } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const providerError = url.searchParams.get("error");
    if (providerError) {
      return createOAuthErrorRedirect(
        request,
        providerError === "access_denied" ? "provider_cancelled" : "oauth_failed",
      );
    }

    const code = url.searchParams.get("code");
    const receivedState = url.searchParams.get("state");
    const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
    if (
      !code ||
      !receivedState ||
      !expectedState ||
      !oauthStateMatches(expectedState, receivedState)
    ) {
      return createOAuthErrorRedirect(request, "oauth_failed");
    }

    const pkceVerifier = request.cookies.get(OAUTH_PKCE_COOKIE)?.value;
    if (!pkceVerifier) {
      return createOAuthErrorRedirect(request, "oauth_failed");
    }

    const identity = await fetchGoogleIdentity(request, code, pkceVerifier);
    const linked = await linkOAuthAccount(identity);
    const response = createOAuthSuccessRedirect(request);
    await issueSessionCookie(
      response,
      linked.user,
      linked.sessionVersion,
      request,
    );
    return response;
  } catch (error) {
    if (error instanceof OAuthCallbackError) {
      logError("[auth/callback/google] rejected:", error);
      return createOAuthErrorRedirect(request, error.code);
    }
    logError("[auth/callback/google] error:", error);
    return createOAuthErrorRedirect(request, "oauth_failed");
  }
}
