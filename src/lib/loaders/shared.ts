export function formatDateOnly(date: Date) {
  return date.toISOString().split("T")[0];
}

export function shiftDateOnly(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return formatDateOnly(next);
}

export function isUuidLike(value: string | null | undefined) {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

export function getSafeAccountDisplayName(input: {
  rawName: string | null | undefined;
  userDisplayName: string;
  contentDirection: string | null | undefined;
  index: number;
  total: number;
}) {
  const rawName = input.rawName?.trim();
  if (rawName && !isUuidLike(rawName)) return rawName;

  const direction = input.contentDirection?.trim();
  if (direction) return `${input.userDisplayName} · ${direction}`;
  if (input.total > 1) return `${input.userDisplayName} · 账号${input.index + 1}`;
  return input.userDisplayName;
}

export function uniqueNonEmpty(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}
