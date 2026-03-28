export function toSafeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function toOptionalString(value: unknown) {
  const text = toSafeString(value);
  return text ? text : null;
}

export function toBoolean(value: unknown) {
  return value === true;
}

export function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean);
}

export function toDateString(value: unknown) {
  const text = toSafeString(value);
  if (!text) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  return text;
}
