import sharp from "sharp";

const JPEG_OPTIMIZE_THRESHOLD = 250 * 1024;

export async function optimizeStoredSubmissionScreenshot(input: {
  buffer: Buffer;
  contentType: string;
}) {
  if (input.contentType !== "image/jpeg" || input.buffer.length < JPEG_OPTIMIZE_THRESHOLD) {
    return input;
  }

  // 高频上传使用快速 JPEG 编码；mozjpeg 的额外压缩收益不足以抵消 CPU 成本。
  const optimized = await sharp(input.buffer).jpeg({ quality: 90 }).toBuffer();
  return optimized.length < input.buffer.length
    ? { buffer: optimized, contentType: "image/jpeg" }
    : input;
}
