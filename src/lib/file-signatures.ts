export type SupportedImageMimeType = "image/jpeg" | "image/png" | "image/webp";

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

export function detectImageMimeType(input: Uint8Array): SupportedImageMimeType | null {
  if (startsWith(input, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (startsWith(input, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  if (
    startsWith(input, [0x52, 0x49, 0x46, 0x46]) &&
    input[8] === 0x57 &&
    input[9] === 0x45 &&
    input[10] === 0x42 &&
    input[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export function hasMatchingImageSignature(input: Uint8Array, declaredMimeType: string) {
  return detectImageMimeType(input) === declaredMimeType;
}

export function hasZipSignature(input: Uint8Array) {
  return startsWith(input, [0x50, 0x4b, 0x03, 0x04]);
}
