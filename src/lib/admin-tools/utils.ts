import { toBoolean, toTrimmedString } from "@/lib/type-guards";

export { toBoolean, toTrimmedString };

/** @deprecated Use toTrimmedString instead */
export const toSafeString = toTrimmedString;

export function toOptionalString(value: unknown) {
  const text = toTrimmedString(value);
  return text ? text : null;
}

export function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean);
}

export function toDateString(value: unknown) {
  const text = toTrimmedString(value);
  if (!text) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  return text;
}
