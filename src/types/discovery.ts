export interface DiscoveryResultItem {
  competition: import("./database").Competition;
  reasons: string[];
}

export interface DiscoveryApiResponse {
  mode: "ai" | "fallback";
  results: DiscoveryResultItem[];
  message?: string;
}
