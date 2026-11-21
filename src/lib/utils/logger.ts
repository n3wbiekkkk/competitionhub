export type LogLevel = "debug" | "info" | "warn" | "error" | "audit";

const REDACT_KEYS = /password|token|secret|authorization|cookie|apikey|api_key|smtp|webhook/i;

export function redactLogFields(fields: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    output[key] = REDACT_KEYS.test(key) ? "[REDACTED]" : value;
  }
  return output;
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
