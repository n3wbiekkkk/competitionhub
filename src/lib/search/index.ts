import { logError, logEvent } from "@/lib/utils/logger";
import { createExaSearchProvider } from "./providers/exa";
import { createFirecrawlSearchProvider } from "./providers/firecrawl";
import { createTavilySearchProvider } from "./providers/tavily";
import type {
  SearchFetch,
  WebSearchProvider,
  WebSearchProviderId,
  WebSearchResult,
} from "./types";

const ENV_KEYS: Record<WebSearchProviderId, string> = {
  tavily: "TAVILY_API_KEY",
  exa: "EXA_API_KEY",
  firecrawl: "FIRECRAWL_API_KEY",
};

const PROVIDER_IDS: readonly WebSearchProviderId[] = [
  "tavily",
  "exa",
  "firecrawl",
];

function parseProviderId(value: string | undefined): WebSearchProviderId | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === "auto") return null;
  return PROVIDER_IDS.find((id) => id === normalized) ?? null;
}

export function resolveSearchProvider(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: SearchFetch,
): WebSearchProvider | null {
  const requested = parseProviderId(env.SEARCH_PROVIDER);
  const candidates = requested ? [requested] : PROVIDER_IDS;

  for (const id of candidates) {
    const apiKey = env[ENV_KEYS[id]]?.trim();
    if (!apiKey) {
      logEvent("warn", "search/provider_missing_key", { provider: id });
      continue;
    }

    switch (id) {
      case "tavily":
        return createTavilySearchProvider(apiKey, { fetchImpl });
      case "exa":
        return createExaSearchProvider(apiKey, { fetchImpl });
      case "firecrawl":
        return createFirecrawlSearchProvider(apiKey, { fetchImpl });
    }
  }

  return null;
}

export async function searchCompetitionListings(
  query: string,
  options?: {
    limit?: number;
    signal?: AbortSignal;
    provider?: WebSearchProvider;
    fetchImpl?: SearchFetch;
  },
): Promise<WebSearchResult[]> {
  const provider =
    options?.provider ?? resolveSearchProvider(process.env, options?.fetchImpl);
  if (!provider || !query.trim()) {
    return [];
  }

  try {
    return await provider.search({
      query: query.trim(),
      limit: options?.limit ?? 5,
      signal: options?.signal,
    });
  } catch (error) {
    logError("search/provider_failed", error, { provider: provider.id });
    return [];
  }
}
