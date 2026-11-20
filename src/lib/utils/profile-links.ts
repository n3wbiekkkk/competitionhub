import { validatePublicHttpUrl } from "@/lib/utils/url-safety";

export const SOCIAL_HOSTS = {
  github: ["github.com", "gist.github.com"],
  discord: ["discord.com", "discordapp.com", "discord.gg"],
  line: ["line.me", "lin.ee", "page.line.me"],
} as const;

export function isValidProfileLink(
  raw: string | null | undefined,
  allowedHosts?: readonly string[],
): boolean {
  if (!raw || raw.trim() === "") return true;
  try {
    const url = validatePublicHttpUrl(raw);
    if (!allowedHosts) return true;
    const host = url.hostname.toLowerCase();
    return allowedHosts.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`),
    );
  } catch {
    return false;
  }
}
