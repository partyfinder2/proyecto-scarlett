import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getMetaOAuthConfig, getMetaOAuthStatus } from "./metaLoopback";

describe("metaLoopback config", () => {
  it("reports missing env when unset", () => {
    const prevId = process.env.META_APP_ID;
    const prevSecret = process.env.META_APP_SECRET;
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
    const st = getMetaOAuthStatus();
    assert.equal(st.configured, false);
    assert.ok(st.missing.includes("META_APP_ID"));
    if (prevId) process.env.META_APP_ID = prevId;
    if (prevSecret) process.env.META_APP_SECRET = prevSecret;
  });

  it("builds redirect from port when URI omitted", () => {
    const prevId = process.env.META_APP_ID;
    const prevSecret = process.env.META_APP_SECRET;
    const prevPort = process.env.META_OAUTH_PORT;
    const prevUri = process.env.META_OAUTH_REDIRECT_URI;
    process.env.META_APP_ID = "123";
    process.env.META_APP_SECRET = "sec";
    process.env.META_OAUTH_PORT = "8765";
    delete process.env.META_OAUTH_REDIRECT_URI;
    const cfg = getMetaOAuthConfig();
    assert.ok(cfg);
    assert.equal(cfg?.redirectUri, "http://127.0.0.1:8765/oauth/meta/callback");
    if (prevId) process.env.META_APP_ID = prevId;
    else delete process.env.META_APP_ID;
    if (prevSecret) process.env.META_APP_SECRET = prevSecret;
    else delete process.env.META_APP_SECRET;
    if (prevPort) process.env.META_OAUTH_PORT = prevPort;
    else delete process.env.META_OAUTH_PORT;
    if (prevUri) process.env.META_OAUTH_REDIRECT_URI = prevUri;
    else delete process.env.META_OAUTH_REDIRECT_URI;
  });
});
