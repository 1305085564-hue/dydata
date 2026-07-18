import test from "node:test";
import assert from "node:assert/strict";

import { detectImageMimeType, hasMatchingImageSignature, hasZipSignature } from "./file-signatures";

test("识别 PNG、JPEG 和 WebP 文件头", () => {
  assert.equal(detectImageMimeType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(detectImageMimeType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(
    detectImageMimeType(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])),
    "image/webp"
  );
});

test("声明为图片但内容不是图片时拒绝", () => {
  const script = new TextEncoder().encode("<script>alert(1)</script>");
  assert.equal(detectImageMimeType(script), null);
  assert.equal(hasMatchingImageSignature(script, "image/png"), false);
  assert.equal(
    hasMatchingImageSignature(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]), "image/png"),
    false
  );
});

test("XLSX 必须具有 ZIP 文件头", () => {
  assert.equal(hasZipSignature(Uint8Array.from([0x50, 0x4b, 0x03, 0x04])), true);
  assert.equal(hasZipSignature(new TextEncoder().encode("not an xlsx")), false);
});
