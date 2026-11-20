import { isIP } from "node:net";

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a >= 192 && b === 18) ||
    a >= 224
  );
}

function isPrivateIpv6(rawHost: string): boolean {
  const normalized = rawHost.replace(/^\[|\]$/g, "").toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) {
    return true;
  }
  if (normalized.startsWith("::ffff:")) {
    const mappedV4 = normalized.slice("::ffff:".length);
    if (isIP(mappedV4) === 4) {
      return isPrivateIpv4(mappedV4);
    }
  }
  return false;
}

/**
 * Validates that a URL is a public http/https URL and blocks loopback,
 * local hostnames, and private/CGNAT IP ranges to prevent SSRF.
 */
export function validatePublicHttpUrl(rawUrl: string): URL {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error("กรุณาระบุลิงก์ (URL)");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("รูปแบบลิงก์ (URL) ไม่ถูกต้อง");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("รองรับเฉพาะลิงก์ http:// หรือ https:// เท่านั้น");
  }

  if (parsed.username || parsed.password) {
    throw new Error("ไม่อนุญาตให้ระบุข้อมูลยืนยันตัวตนใน URL");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("ไม่อนุญาตให้เข้าถึงลิงก์ภายในเครือข่าย");
  }

  const bareHost = hostname.replace(/^\[|\]$/g, "");
  const ipVersion = isIP(bareHost);
  if (ipVersion === 4 && isPrivateIpv4(bareHost)) {
    throw new Error("ไม่อนุญาตให้เข้าถึง IP ส่วนตัวหรือ Loopback");
  }
  if (ipVersion === 6 && isPrivateIpv6(bareHost)) {
    throw new Error("ไม่อนุญาตให้เข้าถึง IPv6 ส่วนตัวหรือ Loopback");
  }

  return parsed;
}

/**
 * Validates internal redirect paths so open redirects cannot happen.
 */
export function isSafeInternalRedirect(next: string | null | undefined): string {
  if (!next) {
    return "/";
  }
  const trimmed = next.trim();
  // Control characters and backslashes are normalized by browser URL parsers;
  // reject them instead of allowing an internal-looking path to become external.
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    /[\\\u0000-\u0020\u007f]/.test(trimmed)
  ) {
    return "/";
  }
  return trimmed;
}
