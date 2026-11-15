export type ClipboardImageItem = {
  type: string;
  getAsFile: () => File | null;
};

export function extractClipboardImageFiles(
  items: ArrayLike<ClipboardImageItem> | null | undefined,
) {
  if (!items) return [];

  return Array.from(items).flatMap((item) => {
    if (!item.type.startsWith("image/")) return [];
    const file = item.getAsFile();
    return file ? [file] : [];
  });
}
