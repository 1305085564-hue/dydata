import test from "node:test";
import assert from "node:assert/strict";

import { __internal } from "./client";

test("databaseOnly 模式下 resolveModel 不读取环境变量模型", () => {
  const prevAiModel = process.env.AI_MODEL;
  process.env.AI_MODEL = "env-model";

  try {
    const model = __internal.resolveModel(
      {
        name: "ocr-channel",
        baseUrl: "https://example.com",
        apiKey: "secret",
        model: null,
        source: "database",
      },
      {
        messages: [{ role: "user", content: "hello" }],
        databaseOnly: true,
      }
    );

    assert.equal(model, "claude-sonnet-4-6");
  } finally {
    if (prevAiModel === undefined) {
      delete process.env.AI_MODEL;
    } else {
      process.env.AI_MODEL = prevAiModel;
    }
  }
});

test("普通模式下 resolveModel 仍可回落到环境变量模型", () => {
  const prevAiModel = process.env.AI_MODEL;
  process.env.AI_MODEL = "env-model";

  try {
    const model = __internal.resolveModel(
      {
        name: "default-channel",
        baseUrl: "https://example.com",
        apiKey: "secret",
        model: null,
        source: "database",
      },
      {
        messages: [{ role: "user", content: "hello" }],
      }
    );

    assert.equal(model, "env-model");
  } finally {
    if (prevAiModel === undefined) {
      delete process.env.AI_MODEL;
    } else {
      process.env.AI_MODEL = prevAiModel;
    }
  }
});
