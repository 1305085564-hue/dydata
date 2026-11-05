import assert from "node:assert/strict";
import test from "node:test";
import { buildHaikuVisionBody, parseHaikuVisionResponse, usesHaikuNativeVision } from "./haiku-vision-transport";
const options = { messages: [{ role: "user" as const, content: [{ type: "image_url" as const, image_url: { url: "data:image/png;base64,YWJj" } }, { type: "text" as const, text: "read" }] }] };
test("only the verified Haiku vision path changes format; text and other models retain their transport", () => {
  assert.equal(usesHaikuNativeVision("claude-haiku-5-5", options), true);
  assert.equal(usesHaikuNativeVision("claude-haiku-5.5", options), true);
  assert.equal(usesHaikuNativeVision("claude-haiku-4-5", options), false);
  assert.equal(usesHaikuNativeVision("claude-haiku-5-5", { messages: [{ role: "user", content: "hi" }] }), false);
  assert.deepEqual(buildHaikuVisionBody("claude-haiku-5-5", options).messages[0].content[0], { type: "image", source: { type: "base64", media_type: "image/png", data: "YWJj" } });
});
test("native response uses answer text and original token usage, never reasoning", async () => {
  const result = await parseHaikuVisionResponse(Response.json({ model: "claude-haiku-5-5", content: [{ type: "thinking", text: "private" }, { type: "text", text: "7392" }], usage: { input_tokens: 10, output_tokens: 4 } }), options);
  assert.equal(result.content, "7392");
  assert.equal(result.usage.totalTokens, 14);
});
