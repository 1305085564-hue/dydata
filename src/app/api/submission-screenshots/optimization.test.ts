import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { optimizeStoredSubmissionScreenshot } from "./route";

test("截图优化：小 JPEG 和非 JPEG 保留原始字节", async () => {
  for (const contentType of ["image/jpeg", "image/png", "image/webp"]) {
    const input = { buffer: Buffer.alloc(contentType === "image/jpeg" ? 1024 : 300 * 1024), contentType };
    assert.equal(await optimizeStoredSubmissionScreenshot(input), input);
  }
});

test("截图优化：大 JPEG 仍可解码、保留完整尺寸且不扩大文件", async () => {
  const width = 1080;
  const height = 2400;
  const pixels = Buffer.alloc(width * height * 3);
  let seed = 17;
  for (let i = 0; i < pixels.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    pixels[i] = seed >>> 24;
  }
  const buffer = await sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg({ quality: 100 }).toBuffer();
  assert.ok(buffer.length > 250 * 1024);
  const optimized = await optimizeStoredSubmissionScreenshot({ buffer, contentType: "image/jpeg" });
  const metadata = await sharp(optimized.buffer).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.width, width);
  assert.equal(metadata.height, height);
  assert.equal(optimized.contentType, "image/jpeg");
  assert.ok(optimized.buffer.length < buffer.length);

  const alreadyCompressed = await sharp(pixels, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 30 }).toBuffer();
  assert.ok(alreadyCompressed.length > 250 * 1024);
  const larger = await sharp(alreadyCompressed).jpeg({ quality: 90 }).toBuffer();
  assert.ok(larger.length > alreadyCompressed.length, "样本应确实触发编码增大分支");
  const input = { buffer: alreadyCompressed, contentType: "image/jpeg" };
  assert.equal(await optimizeStoredSubmissionScreenshot(input), input);
});
