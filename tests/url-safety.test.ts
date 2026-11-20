import { isIP } from "node:net";
import test from "node:test";
import assert from "node:assert/strict";
import {
  isSafeInternalRedirect,
  validatePublicHttpUrl,
} from "../src/lib/utils/url-safety.ts";

for (const unsafe of [
  "/\t/evil.com",
  "/\n//evil.com",
  "https://evil.com",
  "//evil.com",
  "/\\evil.com",
  "\\evil.com",
  "/ /evil.com",
  "",
  null,
]) {
  test(`redirect rejects ${JSON.stringify(unsafe)}`, () => {
    assert.equal(isSafeInternalRedirect(unsafe), "/");
  });
}

test("redirect preserves an internal destination", () => {
  assert.equal(
    isSafeInternalRedirect("/my-teams?tab=confirmed"),
    "/my-teams?tab=confirmed",
  );
});

test("URL guard accepts public HTTPS", () => {
  assert.equal(
    validatePublicHttpUrl(" https://example.com/path ").origin,
    "https://example.com",
  );
});

for (const url of [
  "http://127.0.0.1",
  "http://localhost",
  "http://192.168.1.1",
  "http://[::1]",
  "file:///etc/passwd",
  "https://user:pass@example.com",
]) {
  test(`URL guard rejects ${url}`, () => {
    assert.throws(() => validatePublicHttpUrl(url));
  });
}

test("node:net recognises mapped IPv4 addresses used by the guard", () => {
  assert.equal(isIP("::ffff:127.0.0.1"), 6);
});
