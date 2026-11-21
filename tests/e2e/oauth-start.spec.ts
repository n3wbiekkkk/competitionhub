import { expect, test, type APIRequestContext } from "@playwright/test";

const appBaseUrl = (process.env.APP_BASE_URL ?? "https://pbcomphub.dpdns.org").replace(/\/+$/, "");

async function startOAuth(
  request: APIRequestContext,
  provider: "google" | "github",
  providerHost: string,
): Promise<URL> {
  const response = await request.get(`/api/auth/oauth/${provider}/start`, {
    maxRedirects: 0,
  });
  expect(response.status(), `${provider} start should redirect`).toBe(302);

  const location = response.headers().location;
  expect(location, `${provider} start should set Location`).toBeTruthy();

  const redirect = new URL(location!, "http://localhost");
  expect(redirect.host, `${provider} start should target ${providerHost}`).toBe(providerHost);
  expect(redirect.searchParams.get("redirect_uri")).toBe(
    `${appBaseUrl}/api/auth/callback/${provider}`,
  );
  return redirect;
}

function expectScopes(redirect: URL, ...required: string[]): void {
  const scopes = new Set((redirect.searchParams.get("scope") ?? "").split(/\s+/).filter(Boolean));
  for (const scope of required) {
    expect(scopes.has(scope), `scope should include ${scope}`).toBe(true);
  }
}

test("Google OAuth start 302 ไปยัง accounts.google.com พร้อม S256 PKCE", async ({ request }) => {
  const redirect = await startOAuth(request, "google", "accounts.google.com");
  expect(redirect.searchParams.get("code_challenge_method")).toBe("S256");
  expect(redirect.searchParams.get("code_challenge")).toBeTruthy();
  expectScopes(redirect, "openid");
});

test("GitHub OAuth start 302 ไปยัง github.com พร้อม scope read:user และ user:email", async ({ request }) => {
  const redirect = await startOAuth(request, "github", "github.com");
  expectScopes(redirect, "read:user", "user:email");
});
