export type PublishedAtSource = "ocr" | "manual" | null;

export function resolvePublishedAtSource(
  value: string,
  ocrPublishedAtValue: string,
): PublishedAtSource {
  if (!value) return null;
  return ocrPublishedAtValue && value === ocrPublishedAtValue ? "ocr" : "manual";
}
