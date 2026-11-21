export function getRequestIp(request: Request): string {
  if (process.env.TRUST_PROXY_HEADERS === "true") {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
    const real = request.headers.get("x-real-ip")?.trim();
    if (real) return real;
  }
  return "direct";
}
