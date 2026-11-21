import test from "node:test";
import assert from "node:assert/strict";
import {
  RetryExhaustedError,
  RetryableHttpError,
  runWithRetry,
} from "../src/lib/ai/retry.ts";

test("a first-attempt success reports one attempt and skips backoff", async () => {
  let calls = 0;
  let sleeps = 0;

  const result = await runWithRetry({
    operation: () => {
      calls += 1;
      return "ok";
    },
    sleep: async () => {
      sleeps += 1;
    },
  });

  assert.deepEqual(result, { value: "ok", attempts: 1 });
  assert.equal(calls, 1);
  assert.equal(sleeps, 0);
});

test("a transient network failure is retried with exponential backoff", async () => {
  const attempts: number[] = [];
  const delays: number[] = [];

  const result = await runWithRetry({
    operation: (attempt) => {
      attempts.push(attempt);
      if (attempt === 1) {
        throw new TypeError("fetch failed");
      }
      return "ok";
    },
    attempts: 3,
    baseDelayMs: 100,
    random: () => 1,
    sleep: async (delayMs) => {
      delays.push(delayMs);
    },
  });

  assert.deepEqual(result, { value: "ok", attempts: 2 });
  assert.deepEqual(attempts, [1, 2]);
  assert.deepEqual(delays, [100]);
});

test("429 and 503 are retried until the attempt budget is exhausted", async () => {
  const attempts: number[] = [];
  const delays: number[] = [];

  await assert.rejects(
    runWithRetry({
      operation: (attempt) => {
        attempts.push(attempt);
        throw new RetryableHttpError(503);
      },
      attempts: 3,
      baseDelayMs: 100,
      random: () => 1,
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof RetryExhaustedError);
      assert.equal(error.attempts, 3);
      assert.equal(error.retryable, true);
      assert.ok(error.originalError instanceof RetryableHttpError);
      assert.equal(error.originalError.status, 503);
      return true;
    },
  );

  assert.deepEqual(attempts, [1, 2, 3]);
  assert.deepEqual(delays, [100, 200]);
});

test("permanent HTTP failures and invalid URLs are never retried", async () => {
  const failures: unknown[] = [
    new RetryableHttpError(400),
    new RetryableHttpError(404),
    new TypeError("Failed to parse URL from not-a-url"),
  ];

  for (const failure of failures) {
    let calls = 0;
    let sleeps = 0;

    await assert.rejects(
      runWithRetry({
        operation: () => {
          calls += 1;
          throw failure;
        },
        attempts: 3,
        sleep: async () => {
          sleeps += 1;
        },
      }),
      (error: unknown) => {
        assert.ok(error instanceof RetryExhaustedError);
        assert.equal(error.attempts, 1);
        assert.equal(error.retryable, false);
        assert.equal(error.originalError, failure);
        return true;
      },
    );

    assert.equal(calls, 1);
    assert.equal(sleeps, 0);
  }
});

test("backoff is capped at maxDelayMs", async () => {
  const delays: number[] = [];

  await assert.rejects(
    runWithRetry({
      operation: () => {
        throw new TypeError("fetch failed");
      },
      attempts: 4,
      baseDelayMs: 100,
      maxDelayMs: 150,
      random: () => 1,
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
    }),
    RetryExhaustedError,
  );

  assert.deepEqual(delays, [100, 150, 150]);
});

test("an already aborted signal prevents the first attempt", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;

  await assert.rejects(
    runWithRetry({
      operation: () => {
        calls += 1;
        return "ok";
      },
      signal: controller.signal,
    }),
    (error: unknown) =>
      error instanceof DOMException && error.name === "AbortError",
  );

  assert.equal(calls, 0);
});

test("aborting during backoff stops before the next attempt", async () => {
  const controller = new AbortController();
  const attempts: number[] = [];

  await assert.rejects(
    runWithRetry({
      operation: (attempt) => {
        attempts.push(attempt);
        throw new TypeError("fetch failed");
      },
      attempts: 3,
      signal: controller.signal,
      sleep: async () => {
        controller.abort();
      },
    }),
    (error: unknown) =>
      error instanceof DOMException && error.name === "AbortError",
  );

  assert.deepEqual(attempts, [1]);
});

test("default backoff aborts when the signal is aborted", async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20);
  let calls = 0;

  try {
    await assert.rejects(
      runWithRetry({
        operation: () => {
          calls += 1;
          throw new TypeError("fetch failed");
        },
        attempts: 3,
        baseDelayMs: 100,
        signal: controller.signal,
      }),
      (error: unknown) => error === controller.signal.reason,
    );
    assert.equal(calls, 1);
  } finally {
    clearTimeout(timer);
  }
});

test("an AbortError from the operation is not retried", async () => {
  const abortError = new DOMException("Aborted", "AbortError");
  let calls = 0;

  await assert.rejects(
    runWithRetry({
      operation: () => {
        calls += 1;
        throw abortError;
      },
      attempts: 3,
    }),
    (error: unknown) => error === abortError,
  );

  assert.equal(calls, 1);
});
