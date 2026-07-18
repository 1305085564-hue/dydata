const OCR_STORAGE_BUCKET = "submission-screenshots";

export function validateOcrStorageReference(userId: string, bucket: string, path: string) {
  if (bucket !== OCR_STORAGE_BUCKET) {
    return { ok: false as const, error: "图片存储位置不受支持" };
  }

  const parts = path.split("/");
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    parts.some((part) => !part || part === "." || part === "..")
  ) {
    return { ok: false as const, error: "图片路径不正确" };
  }

  if (!path.startsWith(`${userId}/`)) {
    return { ok: false as const, error: "无权限访问该图片" };
  }

  return { ok: true as const, bucket: OCR_STORAGE_BUCKET, path };
}
