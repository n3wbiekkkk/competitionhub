import { z } from "zod";
import { fetchSearchJson } from "../http";
import { toWebSearchResult } from "../result";
import type { SearchFetch, WebSearchProvider } from "../types";

const exaResponseSchema = z.object({
  results: z.array(
    z.object({
      url: z.string(),
      title: z.string().nullish(),
      highlights: z.array(z.string()).nullish(),
      text: z.string().nullish(),
      publishedDate: z.string().nullish(),
    }),
  ),
});

export function createExaSearchProvider(
  apiKey: string,
  options?: { fetchImpl?: SearchFetch },
): WebSearchProvider {
  return {
    id: "exa",
    async search({ query, limit, signal }) {
      const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
      const payload = await fetchSearchJson({
        url: "https://api.exa.ai/search",
        init: {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            query,
            numResults: boundedLimit,
            type: "auto",
            contents: { highlights: true },
          }),
        },
        parse: (value) => exaResponseSchema.parse(value),
        fetchImpl: options?.fetchImpl,
        signal,
      });

      return payload.results
        .map((item) =>
          toWebSearchResult({
            url: item.url,
            title: item.title,
            snippet: item.highlights?.join(" ") || item.text,
            publishedAt: item.publishedDate,
          }),
        )
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .slice(0, boundedLimit);
    },
  };
}
