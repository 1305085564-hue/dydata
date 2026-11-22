import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_OCR_SCREENSHOT_CHANNEL,
  parseOcrChannelValue,
  parseOcrScreenshotChannel,
} from "./ocr-channel";

test("parseOcrChannelValue 支持 baidu / vision / clairic，非法值兜底 baidu", () => {
  assert.equal(DEFAULT_OCR_SCREENSHOT_CHANNEL, "baidu");
  assert.equal(parseOcrChannelValue("baidu"), "baidu");
  assert.equal(parseOcrChannelValue("vision"), "vision");
  assert.equal(parseOcrChannelValue("clairic"), "clairic");
  assert.equal(parseOcrChannelValue("chatgpt"), "baidu");
  assert.equal(parseOcrChannelValue(""), "baidu");
  assert.equal(parseOcrChannelValue(null), "baidu");
  assert.equal(parseOcrChannelValue(undefined), "baidu");
  assert.equal(parseOcrChannelValue(123), "baidu");
});

test("parseOcrScreenshotChannel 正确解析行配置并在缺失/非法时兜底 baidu", () => {
  assert.equal(parseOcrScreenshotChannel(null), "baidu");
  assert.equal(parseOcrScreenshotChannel(undefined), "baidu");
  assert.equal(parseOcrScreenshotChannel({ channel_settings: null }), "baidu");
  assert.equal(parseOcrScreenshotChannel({ channel_settings: {} }), "baidu");
  assert.equal(
    parseOcrScreenshotChannel({ channel_settings: { ocr_screenshot_channel: "clairic" } }),
    "clairic",
  );
  assert.equal(
    parseOcrScreenshotChannel({ channel_settings: { ocr_screenshot_channel: "vision" } }),
    "vision",
  );
  assert.equal(
    parseOcrScreenshotChannel({ channel_settings: { ocr_screenshot_channel: "unknown" } }),
    "baidu",
  );
});
