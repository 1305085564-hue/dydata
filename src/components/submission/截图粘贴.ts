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

export function isEditablePasteTarget(target: unknown) {
  if (!target || typeof target !== "object") return false;

  const element = target as {
    tagName?: string;
    isContentEditable?: boolean;
    closest?: (selector: string) => unknown;
  };
  const tagName = element.tagName?.toUpperCase();

  if (tagName === "INPUT" || tagName === "TEXTAREA" || element.isContentEditable) {
    return true;
  }

  return Boolean(
    element.closest?.('input, textarea, [contenteditable="true"], [contenteditable=""]'),
  );
}
