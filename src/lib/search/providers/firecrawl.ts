import { z } from "zod";
import { fetchSearchJson } from "../http";
import { toWebSearchResult } from "../result";
import type { SearchFetch, WebSearchProvider } from "../types";

const firecrawlResponseSchema = z.object({
  success: z.boolean().nullish(),
  data: z.object({
    web: z.array(
      z.object({
        url: z.string(),
        title: z.string().nullish(),
        description: z.string().nullish(),
        markdown: z.string().nullish(),
        metadata: z
          .object({ publishedTime: z.string().nullish() })
          .passthrough()
          .nullish(),
      }),
    ),
  }),
});

export function createFirecrawlSearchProvider(
  apiKey: string,
  options?: { fetchImpl?: SearchFetch },
): WebSearchProvider {
  return {
    id: "firecrawl",
    async search({ query, limit, signal }) {
      const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
      const payload = await fetchSearchJson({
        url: "https://api.firecrawl.dev/v2/search",
        init: {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            query,
            limit: boundedLimit,
            country: "TH",
            sources: [{ type: "web" }],
          }),
        },
        parse: (value) => firecrawlResponseSchema.parse(value),
        fetchImpl: options?.fetchImpl,
        signal,
      });

      if (payload.success === false) {
        throw new Error("บริการค้นหาไม่สำเร็จ");
      }

      return payload.data.web
        .map((item) =>
          toWebSearchResult({
            url: item.url,
            title: item.title,
            snippet: item.description || item.markdown,
            publishedAt: item.metadata?.publishedTime,
          }),
        )
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .slice(0, boundedLimit);
    },
  };
}
