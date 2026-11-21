const DEFAULT_ATTEMPTS = 3;
const MAX_ATTEMPTS = 10;
const DEFAULT_BASE_DELAY_MS = 200;
const DEFAULT_MAX_DELAY_MS = 2_000;

const TRANSIENT_ERROR_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "ENOTFOUND",
  "EPIPE",
  "ERR_NETWORK",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);
const TRANSIENT_MESSAGE_PATTERN =
  /fetch failed|network|timeout|timed out|socket hang up|connection reset|broken pipe|temporarily unavailable/i;
const INVALID_URL_PATTERN = /invalid url|failed to parse url|invalid uri/i;

export interface RetryResult<T> {
  value: T;
  attempts: number;
}

export interface RunWithRetryOptions<T> {
  operation: (attempt: number) => T | Promise<T>;
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  signal?: AbortSignal;
  random?: () => number;
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
}

export class RetryableHttpError extends Error {
  status: number;

  constructor(status: number, message = `HTTP ${status}`) {
    super(message);
    this.name = "RetryableHttpError";
    this.status = status;
  }
}

export class RetryExhaustedError extends Error {
  originalError: unknown;
  attempts: number;
  retryable: boolean;

  constructor(originalError: unknown, attempts: number, retryable: boolean) {
    super(`การเรียกใช้ล้มเหลวหลังจากลอง ${attempts} ครั้ง`, {
      cause: originalError,
    });
    this.name = "RetryExhaustedError";
    this.originalError = originalError;
    this.attempts = attempts;
    this.retryable = retryable;
  }
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

export function isRetryableError(error: unknown): boolean {
  if (isAbortError(error)) {
    return false;
  }

  const status = readStatus(error);
  if (status !== null) {
    return isRetryableStatus(status);
  }

  const code = readErrorCode(error);
  if (code !== null && TRANSIENT_ERROR_CODES.has(code)) {
    return true;
  }

  const message = readString(error, "message") ?? "";
  if (INVALID_URL_PATTERN.test(message)) {
    return false;
  }
  return TRANSIENT_MESSAGE_PATTERN.test(message);
}

export async function runWithRetry<T>(
  options: RunWithRetryOptions<T>,
): Promise<RetryResult<T>> {
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > MAX_ATTEMPTS) {
    throw new RangeError("attempts ต้องเป็นเลขจำนวนเต็มระหว่าง 1 ถึง 10");
  }

  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new RangeError("baseDelayMs ต้องเป็นเลขที่ไม่ติดลบ");
  }

  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  if (!Number.isFinite(maxDelayMs) || maxDelayMs < baseDelayMs) {
    throw new RangeError("maxDelayMs ต้องมากกว่าหรือเท่ากับ baseDelayMs");
  }

  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? defaultSleep;
  const signal = options.signal;

  throwIfAborted(signal);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    throwIfAborted(signal);

    try {
      const value = await options.operation(attempt);
      return { value, attempts: attempt };
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) {
        throw signal?.aborted ? abortReason(signal) : error;
      }

      const retryable = isRetryableError(error);
      if (attempt >= attempts || !retryable) {
        throw new RetryExhaustedError(error, attempt, retryable);
      }

      await sleep(backoffDelay(attempt, baseDelayMs, maxDelayMs, random()), signal);
      throwIfAborted(signal);
    }
  }

  throw new RetryExhaustedError(new Error("ไม่มีการลองใหม่"), attempts, false);
}

function backoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  randomValue: number,
): number {
  const jitter = Number.isFinite(randomValue)
    ? Math.min(1, Math.max(0, randomValue))
    : 0.5;
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  return Math.min(
    maxDelayMs,
    Math.round(exponential * (0.5 + jitter * 0.5)),
  );
}

function defaultSleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function abortReason(signal: AbortSignal | undefined): unknown {
  return signal?.reason ?? new DOMException("Aborted", "AbortError");
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw abortReason(signal);
  }
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }
  return readString(error, "name") === "AbortError";
}

function readString(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = Reflect.get(value, key);
  return typeof candidate === "string" ? candidate : null;
}

function readNumber(value: unknown, key: string): number | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = Reflect.get(value, key);
  return typeof candidate === "number" && Number.isFinite(candidate)
    ? candidate
    : null;
}

function readStatus(value: unknown, depth = 0): number | null {
  if (depth > 2 || typeof value !== "object" || value === null) {
    return null;
  }

  const direct = readNumber(value, "status") ?? readNumber(value, "statusCode");
  if (direct !== null) {
    return direct;
  }

  return (
    readStatus(Reflect.get(value, "response"), depth + 1) ??
    readStatus(Reflect.get(value, "cause"), depth + 1)
  );
}

function readErrorCode(value: unknown, depth = 0): string | null {
  if (depth > 2 || typeof value !== "object" || value === null) {
    return null;
  }

  const direct = readString(value, "code");
  if (direct) {
    return direct.toUpperCase();
  }

  return readErrorCode(Reflect.get(value, "cause"), depth + 1);
}
