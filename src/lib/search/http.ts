import {
  RetryableHttpError,
  runWithRetry,
} from "@/lib/ai/retry";
import type { SearchFetch } from "./types";

export async function fetchSearchJson<T>(options: {
  url: string;
  init: RequestInit;
  parse: (value: unknown) => T;
  fetchImpl?: SearchFetch;
  signal?: AbortSignal;
}): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;

  const { value } = await runWithRetry({
    operation: async () => {
      const response = await fetchImpl(options.url, {
        ...options.init,
        signal: options.signal,
      });
      if (!response.ok) {
        throw new RetryableHttpError(response.status);
      }
      const payload: unknown = await response.json();
      return options.parse(payload);
    },
    attempts: 2,
    baseDelayMs: 200,
    signal: options.signal,
  });

  return value;
}
