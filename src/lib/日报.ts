function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatLocalDateTime(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function getDefaultPublishedAtValue(now: Date = new Date()) {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(19, 0, 0, 0);
  return formatLocalDateTime(yesterday);
}

export function getDefaultPublishedAtForBizDate(
  bizDate: string,
  today: string,
  now: Date = new Date(),
) {
  if (bizDate === today) return getDefaultPublishedAtValue(now);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bizDate);
  if (!match) return getDefaultPublishedAtValue(now);

  const sourceDate = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  if (
    sourceDate.getFullYear() !== Number(match[1]) ||
    sourceDate.getMonth() !== Number(match[2]) - 1 ||
    sourceDate.getDate() !== Number(match[3])
  ) {
    return getDefaultPublishedAtValue(now);
  }
  sourceDate.setDate(sourceDate.getDate() - 1);
  sourceDate.setHours(19, 0, 0, 0);
  const previousDate = sourceDate;
  return Number.isNaN(previousDate.getTime())
    ? getDefaultPublishedAtValue(now)
    : formatLocalDateTime(previousDate);
}

export function normalizePublishedAtInputValue(value: string | null | undefined) {
  return value ? value.slice(0, 16) : "";
}

export function normalizePublishedAtForStorage(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function formatShanghaiDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}
