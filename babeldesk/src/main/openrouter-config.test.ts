import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test, afterEach } from "node:test";
import {
  DEFAULT_OPENROUTER_MODEL,
  getOpenRouterCredentials,
  getPublicOpenRouterSettings,
  redactConfigJsonForLogs,
  resolveOpenRouterModel,
  saveOpenRouterSettings,
} from "./openrouter-config";

function tmpDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "babeldesk-config-"));
}

describe("openrouter-config", () => {
  let dir: string;

  afterEach(() => {
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  });

  test("modelo default si no hay config", () => {
    dir = tmpDataDir();
    assert.equal(resolveOpenRouterModel(dir), DEFAULT_OPENROUTER_MODEL);
    const pub = getPublicOpenRouterSettings(dir);
    assert.equal(pub.model, DEFAULT_OPENROUTER_MODEL);
    assert.equal(pub.apiKeyStatus, "empty");
  });

  test("guardar modelo y key sin filtrar key en respuesta pública", () => {
    dir = tmpDataDir();
    saveOpenRouterSettings(dir, {
      apiKey: "sk-test-secret-key-12345",
      model: "openai/gpt-4o-mini",
    });
    const pub = getPublicOpenRouterSettings(dir);
    assert.equal(pub.model, "openai/gpt-4o-mini");
    assert.equal(pub.apiKeyStatus, "saved");

    const logged = redactConfigJsonForLogs(dir);
    assert.ok(!logged.includes("sk-test"));
    assert.ok(!logged.includes("secret"));

    const creds = getOpenRouterCredentials(dir);
    assert.ok(creds);
    assert.equal(creds!.model, "openai/gpt-4o-mini");
    assert.equal(creds!.apiKey, "sk-test-secret-key-12345");
  });

  test("guardar solo modelo no borra key existente", () => {
    dir = tmpDataDir();
    saveOpenRouterSettings(dir, { apiKey: "sk-keep-me", model: "anthropic/claude-3.5-haiku" });
    saveOpenRouterSettings(dir, { model: "google/gemini-2.0-flash" });
    const creds = getOpenRouterCredentials(dir);
    assert.equal(creds?.apiKey, "sk-keep-me");
    assert.equal(creds?.model, DEFAULT_OPENROUTER_MODEL);
  });
});
