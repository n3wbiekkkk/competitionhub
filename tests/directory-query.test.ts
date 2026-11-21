import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDirectoryQuery } from "../src/lib/db/directory.ts";

test("directory query trims a usable skill or name", () => {
  assert.equal(normalizeDirectoryQuery("  RustV5  "), "RustV5");
});

test("directory query cannot widen a search with SQL wildcards", () => {
  assert.equal(normalizeDirectoryQuery("a%b_c\\d"), "abcd");
});

test("directory query rejects too-short or missing input", () => {
  assert.equal(normalizeDirectoryQuery("a"), null);
  assert.equal(normalizeDirectoryQuery(undefined), null);
});
