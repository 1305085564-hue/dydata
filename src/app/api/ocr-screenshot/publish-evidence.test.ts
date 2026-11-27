import sharp from "sharp";
import { optimizeStoredSubmissionScreenshot } from "@/lib/submission-screenshot-image";
import assert from "node:assert/strict";
import test from "node:test";
import Module, { createRequire } from "node:module";
import { NextRequest } from "next/server";
import { verifyPublishTimeEvidence, publishImageDigest } from "@/lib/publish-time-evidence";

test("OCR真实处理入口把已验证截图与识别时间签名，提交端可验证该证据", async () => {
  const oldSecret = process.env.SCREENSHOT_GRANT_SECRET;
  process.env.SCREENSHOT_GRANT_SECRET = "local-publish-evidence-test";
  const loader = Module as unknown as { _load: (...args: unknown[]) => unknown };
  const originalLoad = loader._load;
  loader._load = function (...args) {
    if (args[0] === "@/lib/screenshot-storage") return {
      downloadSubmissionScreenshotBytes: async () => ({
        ok: true, contentType: "image/png",
        body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
      }),
    };
    return originalLoad.apply(this, args);
  };
  try {
    const { buildOcrScreenshotResponse } = createRequire(__filename)("./route.ts") as typeof import("./route");
    const userId = "11111111-1111-4111-8111-111111111111";
    const path = userId + "/shot.png";
    const publishedAt = "2026-11-28T01:00:00Z";
    const request = new NextRequest("http://localhost/api/ocr-screenshot", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ bucket: "submission-screenshots", path, screenshot_type: "retention" }),
    });
    const deps: Parameters<typeof buildOcrScreenshotResponse>[1] = {
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: userId } } }) } }) as never,
      runOcr: async () => ({
        parsed: { slot_status: "confirmed", screenshot_type: "retention", confidence_score: 1,
          requires_manual_confirmation: false, recognized_fields: { published_at: publishedAt } },
        ocrMs: 1,
      }) as never,
      recordLog: async () => {},
    };
    const observation = { requestId: "local-test", mark: () => {}, setDetail: () => {} };
    const response = await buildOcrScreenshotResponse(request, deps, observation);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(verifyPublishTimeEvidence(body.data.recognized_fields.publish_time_evidence,
      { userId, path: publishImageDigest(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64")), publishedAt }), true);
    const form = new FormData();
    const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    form.set("file", new File([image], "shot.png", { type: "image/png" }));
    form.set("screenshot_type", "retention");
    const multipartResponse = await buildOcrScreenshotResponse(
      new NextRequest("http://localhost/api/ocr-screenshot", { method: "POST", body: form }),
      deps, observation,
    );
    assert.equal(multipartResponse.status, 200);
    const multipartBody = await multipartResponse.json();
    assert.equal(verifyPublishTimeEvidence(multipartBody.data.recognized_fields.publish_time_evidence,
      { userId, path: publishImageDigest(image), publishedAt }), true);
    // 上传会压缩大 JPEG；OCR 凭据必须匹配最终存图字节。
    const pixels = Buffer.alloc(1024 * 1024 * 3);
    let seed = 17;
    for (let i = 0; i < pixels.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels[i] = seed >>> 24;
    }
    const jpeg = await sharp(pixels, { raw: { width: 1024, height: 1024, channels: 3 } })
      .jpeg({ quality: 100 }).toBuffer();
    const stored = await optimizeStoredSubmissionScreenshot({ buffer: jpeg, contentType: "image/jpeg" });
    assert.ok(stored.buffer.length < jpeg.length);
    const jpegForm = new FormData();
    jpegForm.set("file", new File([new Uint8Array(jpeg)], "large.jpg", { type: "image/jpeg" }));
    jpegForm.set("screenshot_type", "retention");
    const jpegResponse = await buildOcrScreenshotResponse(
      new NextRequest("http://localhost/api/ocr-screenshot", { method: "POST", body: jpegForm }), deps, observation,
    );
    assert.equal(jpegResponse.status, 200);
    const jpegBody = await jpegResponse.json();
    assert.equal(verifyPublishTimeEvidence(jpegBody.data.recognized_fields.publish_time_evidence,
      { userId, path: publishImageDigest(stored.buffer), publishedAt }), true);
  } finally {
    loader._load = originalLoad;
    if (oldSecret === undefined) delete process.env.SCREENSHOT_GRANT_SECRET;
    else process.env.SCREENSHOT_GRANT_SECRET = oldSecret;
  }
});
