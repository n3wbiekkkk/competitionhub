import test from "node:test";
import assert from "node:assert/strict";
import { SCOUT_SOURCES } from "../src/lib/ai/scout.ts";
import { searchCompetitionListings, resolveSearchProvider } from "../src/lib/search/index.ts";
import { createExaSearchProvider } from "../src/lib/search/providers/exa.ts";
import { createFirecrawlSearchProvider } from "../src/lib/search/providers/firecrawl.ts";
import { createTavilySearchProvider } from "../src/lib/search/providers/tavily.ts";
import { toWebSearchResult } from "../src/lib/search/result.ts";
import type { SearchFetch, WebSearchProvider } from "../src/lib/search/types.ts";

function jsonFetch(payload: unknown): {
  fetchImpl: SearchFetch;
  urls: string[];
  bodies: Array<Record<string, unknown>>;
  authorization: string[];
} {
  const urls: string[] = [];
  const bodies: Array<Record<string, unknown>> = [];
  const authorization: string[] = [];
  const fetchImpl: SearchFetch = async (input, init) => {
    urls.push(String(input));
    const headers = new Headers(init?.headers);
    authorization.push(headers.get("authorization") ?? "");
    bodies.push(
      JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    );
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { fetchImpl, urls, bodies, authorization };
}

test("search results keep public URLs and drop private targets", () => {
  const publicResult = toWebSearchResult({
    url: "https://www.Example.com/event/1?utm_source=x",
    title: "  Thailand AI Hackathon  ",
    snippet: "เปิดรับสมัคร\nวันที่ 20 ธันวาคม",
    publishedAt: "2026-09-01",
  });

  assert.deepEqual(publicResult, {
    url: "https://www.example.com/event/1?utm_source=x",
    title: "Thailand AI Hackathon",
    snippet: "เปิดรับสมัคร วันที่ 20 ธันวาคม",
    publishedAt: "2026-09-01",
  });
  assert.equal(toWebSearchResult({ url: "http://127.0.0.1/admin" }), null);
  assert.equal(toWebSearchResult({ url: "file:///etc/passwd" }), null);
});

test("each provider maps its own response shape to the common result", async () => {
  const tavily = jsonFetch({
    results: [
      {
        url: "https://example.com/tavily",
        title: "Tavily result",
        content: "snippet one",
        published_date: "2026-08-01",
      },
    ],
  });
  const tavilyResults = await createTavilySearchProvider("test-key", {
    fetchImpl: tavily.fetchImpl,
  }).search({ query: "hackathon", limit: 3 });
  assert.equal(tavily.urls[0], "https://api.tavily.com/search");
  assert.equal(tavily.authorization[0], "Bearer test-key");
  assert.equal(tavily.bodies[0]?.max_results, 3);
  assert.equal(tavily.bodies[0]?.country, "thailand");
  assert.equal(tavilyResults[0]?.title, "Tavily result");
  assert.equal(tavilyResults[0]?.snippet, "snippet one");
  assert.equal(tavilyResults[0]?.publishedAt, "2026-08-01");

  const exa = jsonFetch({
    results: [
      {
        url: "https://example.com/exa",
        title: "Exa result",
        highlights: ["snippet two"],
        publishedDate: "2026-08-02",
      },
    ],
  });
  const exaResults = await createExaSearchProvider("test-key", {
    fetchImpl: exa.fetchImpl,
  }).search({ query: "ctf", limit: 4 });
  assert.equal(exa.urls[0], "https://api.exa.ai/search");
  assert.equal(exa.authorization[0], "Bearer test-key");
  assert.equal(exa.bodies[0]?.numResults, 4);
  assert.equal(exaResults[0]?.snippet, "snippet two");

  const firecrawl = jsonFetch({
    success: true,
    data: {
      web: [
        {
          url: "https://example.com/firecrawl",
          title: "Firecrawl result",
          description: "snippet three",
        },
      ],
    },
  });
  const firecrawlResults = await createFirecrawlSearchProvider("test-key", {
    fetchImpl: firecrawl.fetchImpl,
  }).search({ query: "robot", limit: 5 });
  assert.equal(firecrawl.urls[0], "https://api.firecrawl.dev/v2/search");
  assert.equal(firecrawl.authorization[0], "Bearer test-key");
  assert.equal(firecrawl.bodies[0]?.limit, 5);
  assert.equal(firecrawl.bodies[0]?.country, "TH");
  assert.equal(firecrawlResults[0]?.snippet, "snippet three");
});

test("provider selection honors an explicit choice and auto mode", () => {
  const env = {
    SEARCH_PROVIDER: "exa",
    TAVILY_API_KEY: "one",
    EXA_API_KEY: "two",
    FIRECRAWL_API_KEY: "three",
  } as NodeJS.ProcessEnv;
  assert.equal(resolveSearchProvider(env)?.id, "exa");

  const autoEnv = {
    SEARCH_PROVIDER: "auto",
    TAVILY_API_KEY: "one",
    EXA_API_KEY: "two",
  } as NodeJS.ProcessEnv;
  assert.equal(resolveSearchProvider(autoEnv)?.id, "tavily");
  assert.equal(resolveSearchProvider({} as NodeJS.ProcessEnv), null);
});

test("search failures return no candidates instead of breaking the scout", async () => {
  const failingProvider: WebSearchProvider = {
    id: "tavily",
    async search() {
      throw new Error("provider down");
    },
  };
  assert.deepEqual(
    await searchCompetitionListings("hackathon", { provider: failingProvider }),
    [],
  );
});

test("the scout includes a web search source", () => {
  assert.ok(SCOUT_SOURCES.some((source) => source.id === "web_search"));
});
