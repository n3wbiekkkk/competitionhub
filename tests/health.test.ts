import test from "node:test";
import assert from "node:assert/strict";
import {
  EXPECTED_MIGRATION,
  REQUIRED_FUNCTIONS,
  REQUIRED_TABLES,
  REQUIRED_TRIGGERS,
  isSchemaCurrent,
} from "../src/lib/health/schema.ts";

test("health accepts the expected migration and all required objects", () => {
  assert.equal(
    isSchemaCurrent({
      version: EXPECTED_MIGRATION,
      tables: REQUIRED_TABLES.length,
      functions: REQUIRED_FUNCTIONS.length,
      triggers: REQUIRED_TRIGGERS.length,
    }),
    true,
  );
});

test("health rejects an old migration version even when tables exist", () => {
  assert.equal(
    isSchemaCurrent({
      version: "0001_baseline",
      tables: REQUIRED_TABLES.length,
      functions: REQUIRED_FUNCTIONS.length,
      triggers: REQUIRED_TRIGGERS.length,
    }),
    false,
  );
});

test("health rejects a missing object or a failed lookup", () => {
  assert.equal(
    isSchemaCurrent({
      version: EXPECTED_MIGRATION,
      tables: REQUIRED_TABLES.length - 1,
      functions: REQUIRED_FUNCTIONS.length,
      triggers: REQUIRED_TRIGGERS.length,
    }),
    false,
  );
  assert.equal(isSchemaCurrent(null), false);
});
