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

test("normalizeResponseContent 支持 output_text block", () => {
  const text = __internal.normalizeResponseContent([
    { type: "output_text", text: "第一行" },
    { type: "text", text: "第二行" },
  ]);

  assert.equal(text, "第一行\n第二行");
});

test("describeMissingResponseContent 会带出 finish_reason 和 message 结构", () => {
  const message = __internal.describeMissingResponseContent({
    choices: [
      {
        finish_reason: "stop",
        native_finish_reason: "stop",
        message: {
          content: null,
          reasoning_content: null,
          tool_calls: null,
        },
      },
    ],
  });

  assert.match(message, /AI 未返回有效内容/);
  assert.match(message, /finish_reason=stop/);
  assert.match(message, /content_type=null/);
  assert.match(message, /message_keys=content,reasoning_content,tool_calls/);
});
