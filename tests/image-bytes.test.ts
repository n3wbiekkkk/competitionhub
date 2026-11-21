import test from "node:test";
import assert from "node:assert/strict";
import { hasAllowedImageSignature } from "../src/lib/utils/image-bytes.ts";

const bytes = (...values: number[]) => new Uint8Array(values);

test("accepts real JPEG, PNG and WebP signatures", () => {
  assert.equal(hasAllowedImageSignature(bytes(0xff, 0xd8, 0xff, 0xe0), "image/jpeg"), true);
  assert.equal(hasAllowedImageSignature(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), "image/png"), true);
  assert.equal(hasAllowedImageSignature(new TextEncoder().encode("RIFF0000WEBPVP8 "), "image/webp"), true);
});

test("rejects mismatched, truncated and active-content uploads", () => {
  assert.equal(hasAllowedImageSignature(new TextEncoder().encode("<svg/>"), "image/png"), false);
  assert.equal(hasAllowedImageSignature(bytes(0xff, 0xd8), "image/jpeg"), false);
  assert.equal(hasAllowedImageSignature(bytes(0x89, 0x50), "image/png"), false);
  assert.equal(hasAllowedImageSignature(new TextEncoder().encode("RIFF0000JUNK"), "image/webp"), false);
  assert.equal(hasAllowedImageSignature(bytes(0xff, 0xd8, 0xff), "image/webp"), false);
});
