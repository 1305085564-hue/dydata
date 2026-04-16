const 中国节假日安排: Record<
  number,
  {
    holidays: string[];
    makeupWorkdays: string[];
  }
> = {
  2025: {
    holidays: [
      "2025-01-01",
      "2025-01-28",
      "2025-01-29",
      "2025-01-30",
      "2025-01-31",
      "2025-02-01",
      "2025-02-02",
      "2025-02-03",
      "2025-02-04",
      "2025-04-04",
      "2025-04-05",
      "2025-04-06",
      "2025-05-01",
      "2025-05-02",
      "2025-05-03",
      "2025-05-04",
      "2025-05-05",
      "2025-05-31",
      "2025-06-01",
      "2025-06-02",
      "2025-10-01",
      "2025-10-02",
      "2025-10-03",
      "2025-10-04",
      "2025-10-05",
      "2025-10-06",
      "2025-10-07",
      "2025-10-08",
    ],
    makeupWorkdays: [
      "2025-01-26",
      "2025-02-08",
      "2025-04-27",
      "2025-09-28",
      "2025-10-11",
    ],
  },
  2026: {
    holidays: [
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
      "2026-02-15",
      "2026-02-16",
      "2026-02-17",
      "2026-02-18",
      "2026-02-19",
      "2026-02-20",
      "2026-02-21",
      "2026-02-22",
      "2026-02-23",
      "2026-04-04",
      "2026-04-05",
      "2026-04-06",
      "2026-05-01",
      "2026-05-02",
      "2026-05-03",
      "2026-05-04",
      "2026-05-05",
      "2026-06-19",
      "2026-06-20",
      "2026-06-21",
      "2026-09-25",
      "2026-09-26",
      "2026-09-27",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
    ],
    makeupWorkdays: [
      "2026-01-04",
      "2026-02-14",
      "2026-02-28",
      "2026-05-09",
      "2026-09-20",
      "2026-10-10",
    ],
  },
};

export function hasChinaHolidayPlan(year: number) {
  return year in 中国节假日安排;
}

function formatShanghaiDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });

  const parts = formatter.formatToParts(date);
  const valueOf = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    dateKey: `${valueOf("year")}-${valueOf("month")}-${valueOf("day")}`,
    weekday: valueOf("weekday"),
  };
}

export function isChinaWorkingDay(date: Date = new Date()) {
  const { dateKey, weekday } = formatShanghaiDateParts(date);
  const year = Number(dateKey.slice(0, 4));
  const plan = 中国节假日安排[year];

  if (plan?.makeupWorkdays.includes(dateKey)) return true;
  if (plan?.holidays.includes(dateKey)) return false;

  return weekday !== "Sat" && weekday !== "Sun";
}

export function getChinaWorkingDayReason(date: Date = new Date()) {
  const { dateKey, weekday } = formatShanghaiDateParts(date);
  const year = Number(dateKey.slice(0, 4));
  const plan = 中国节假日安排[year];

  if (plan?.makeupWorkdays.includes(dateKey)) return "调休工作日";
  if (plan?.holidays.includes(dateKey)) return "法定节假日";
  if (weekday === "Sat" || weekday === "Sun") return "周末";
  return "工作日";
}

export function getShanghaiYear(date: Date = new Date()) {
  const { dateKey } = formatShanghaiDateParts(date);
  return Number(dateKey.slice(0, 4));
}
