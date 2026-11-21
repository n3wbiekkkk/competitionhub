import { z } from "zod";
import { fetchSearchJson } from "../http";
import { toWebSearchResult } from "../result";
import type { SearchFetch, WebSearchProvider } from "../types";

const tavilyResponseSchema = z.object({
  results: z.array(
    z.object({
      url: z.string(),
      title: z.string().nullish(),
      content: z.string().nullish(),
      published_date: z.string().nullish(),
    }),
  ),
});

export function createTavilySearchProvider(
  apiKey: string,
  options?: { fetchImpl?: SearchFetch },
): WebSearchProvider {
  return {
    id: "tavily",
    async search({ query, limit, signal }) {
      const boundedLimit = Math.max(1, Math.min(20, Math.trunc(limit)));
      const payload = await fetchSearchJson(
        {
          url: "https://api.tavily.com/search",
          init: {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              query,
              max_results: boundedLimit,
              country: "thailand",
              search_depth: "basic",
              include_answer: false,
              include_raw_content: false,
              include_published_date: true,
            }),
          },
          parse: (value) => tavilyResponseSchema.parse(value),
          fetchImpl: options?.fetchImpl,
          signal,
        },
      );

      return payload.results
        .map((item) =>
          toWebSearchResult({
            url: item.url,
            title: item.title,
            snippet: item.content,
            publishedAt: item.published_date,
          }),
        )
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .slice(0, boundedLimit);
    },
  };
}
