import { validatePublicHttpUrl } from "@/lib/utils/url-safety";
import type { WebSearchResult } from "./types";

export interface RawSearchResult {
  url?: string | null;
  title?: string | null;
  snippet?: string | null;
  publishedAt?: string | null;
}

export function toWebSearchResult(raw: RawSearchResult): WebSearchResult | null {
  if (typeof raw.url !== "string" || !raw.url.trim()) {
    return null;
  }

  let url: string;
  try {
    url = validatePublicHttpUrl(raw.url).toString();
  } catch {
    return null;
  }

  const title = raw.title?.trim() || new URL(url).hostname;
  const snippet = raw.snippet?.replace(/\s+/g, " ").trim().slice(0, 600) ?? "";
  const publishedAt = raw.publishedAt?.trim() || undefined;

  return { url, title, snippet, publishedAt };
}
