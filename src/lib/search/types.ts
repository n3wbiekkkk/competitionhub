export type WebSearchProviderId = "tavily" | "exa" | "firecrawl";

export interface WebSearchResult {
  url: string;
  title: string;
  snippet: string;
  publishedAt?: string;
}

export interface WebSearchInput {
  query: string;
  limit: number;
  signal?: AbortSignal;
}

export interface WebSearchProvider {
  readonly id: WebSearchProviderId;
  search(input: WebSearchInput): Promise<WebSearchResult[]>;
}

export type SearchFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
