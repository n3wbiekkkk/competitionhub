import test from "node:test";
import assert from "node:assert/strict";
import { isValidProfileLink, SOCIAL_HOSTS } from "../src/lib/utils/profile-links.ts";

test("profile links accept public provider URLs", () => {
  assert.equal(isValidProfileLink("https://github.com/newbie", SOCIAL_HOSTS.github), true);
  assert.equal(isValidProfileLink("https://discord.gg/abc", SOCIAL_HOSTS.discord), true);
  assert.equal(isValidProfileLink("https://line.me/ti/p/@abc", SOCIAL_HOSTS.line), true);
  assert.equal(isValidProfileLink("https://example.com/work", undefined), true);
});

test("profile links reject private URLs, credentials and wrong providers", () => {
  assert.equal(isValidProfileLink("http://127.0.0.1", undefined), false);
  assert.equal(isValidProfileLink("https://user:pass@github.com", SOCIAL_HOSTS.github), false);
  assert.equal(isValidProfileLink("https://gitlab.com/newbie", SOCIAL_HOSTS.github), false);
  assert.equal(isValidProfileLink("javascript:alert(1)", undefined), false);
  assert.equal(isValidProfileLink(null, undefined), true);
});
