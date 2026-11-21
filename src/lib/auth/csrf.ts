const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isAllowedMutationOrigin(request: Request): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return true;

  const origin = request.headers.get("origin");
  if (!origin) return true;
  if (origin === "null") return false;

  const host = request.headers.get("host") ?? new URL(request.url).host;

  try {
    const parsed = new URL(origin);
    return parsed.host === host && (parsed.protocol === "http:" || parsed.protocol === "https:");
  } catch {
    return false;
  }
}
