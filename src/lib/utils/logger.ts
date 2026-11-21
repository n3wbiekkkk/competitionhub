export type LogLevel = "debug" | "info" | "warn" | "error" | "audit";

const REDACT_KEYS = /password|token|secret|authorization|cookie|apikey|api_key|smtp|webhook/i;
const REDACT_VALUES = /(?:Bearer\s+\S+|tvly-[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]{8,}|fc-[a-f0-9]{16,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|scrypt\$[a-f0-9]+\$[a-f0-9]+)/i;
const MAX_DEPTH = 4;

export function redactLogFields(
  fields: Record<string, unknown>,
  depth = 0,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    output[key] = REDACT_KEYS.test(key) || depth >= MAX_DEPTH
      ? "[REDACTED]"
      : redactValue(value, depth + 1);
  }
  return output;
}

function redactValue(value: unknown, depth: number): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth));
  }
  if (value && typeof value === "object" && value instanceof Error === false) {
    return redactLogFields(value as Record<string, unknown>, depth);
  }
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (typeof value === "string" && REDACT_VALUES.test(value)) {
    return "[REDACTED]";
  }
  return value;
}

export function logEvent(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    event,
    ...redactLogFields(fields),
  };
  if (level === "error") console.error(JSON.stringify(line));
  else console.log(JSON.stringify(line));
}

export function logError(
  event: string,
  error: unknown,
  fields: Record<string, unknown> = {},
): void {
  const detail =
    error instanceof Error
      ? { name: error.name, message: error.message }
      : { message: "unknown error" };
  logEvent("error", event, { ...fields, error: detail });
}
