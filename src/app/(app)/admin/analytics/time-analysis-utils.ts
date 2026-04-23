export interface TimeAnalysisReport {
  id: string;
  report_date: string;
  play_count: number | null;
  follower_gain: number | null;
  follower_convert: number | null;
  published_at?: string | null;
  uploaded_at?: string;
}

export interface TimeAnalysisCell {
  count: number;
  totalPlay: number;
  medianPlay: number | null;
  plays: number[];
}

export interface TimeAnalysisSummary {
  grid: TimeAnalysisCell[][];
  maxMedianPlay: number;
  bestWindow: {
    w: number;
    h: number;
    score: number;
    sampleCount: number;
    coveredHours: number;
    confidence: "high" | "low" | "none";
  };
  totalWithPlay: number;
  totalEligible: number;
  missingPublishedAtCount: number;
  invalidPublishedAtCount: number;
}

interface ParsedPublishedAt {
  weekdayIndex: number;
  hour: number;
}

const PUBLISHED_AT_PATTERN =
  /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})?$/i;

function isValidCalendarDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function parsePublishedAtForAnalysis(value: string | null | undefined): ParsedPublishedAt | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = PUBLISHED_AT_PATTERN.exec(trimmed);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = secondText ? Number(secondText) : 0;

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second)
  ) {
    return null;
  }

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  if (!isValidCalendarDate(year, month, day)) {
    return null;
  }

  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return {
    weekdayIndex: weekday === 0 ? 6 : weekday - 1,
    hour,
  };
}

function createGrid() {
  return Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, (): TimeAnalysisCell => ({
      count: 0,
      totalPlay: 0,
      medianPlay: null,
      plays: [],
    })),
  );
}

export function buildTimeAnalysisSummary(reports: TimeAnalysisReport[]): TimeAnalysisSummary {
  const grid = createGrid();
  const reportsWithPlay = reports.filter((report) => report.play_count !== null);

  let missingPublishedAtCount = 0;
  let invalidPublishedAtCount = 0;
  let totalEligible = 0;

  for (const report of reportsWithPlay) {
    if (!report.published_at?.trim()) {
      missingPublishedAtCount += 1;
      continue;
    }

    const parsed = parsePublishedAtForAnalysis(report.published_at);
    if (!parsed) {
      invalidPublishedAtCount += 1;
      continue;
    }

    totalEligible += 1;

    const cell = grid[parsed.weekdayIndex][parsed.hour];
    cell.count += 1;
    cell.totalPlay += report.play_count!;
    cell.plays.push(report.play_count!);
  }

  let maxMedianPlay = 0;

  for (let w = 0; w < 7; w += 1) {
    for (let h = 0; h < 24; h += 1) {
      const cell = grid[w][h];
      if (cell.count === 0) continue;

      const sorted = [...cell.plays].sort((left, right) => left - right);
      cell.medianPlay = sorted[Math.floor(sorted.length / 2)];
      if (cell.medianPlay > maxMedianPlay) {
        maxMedianPlay = cell.medianPlay;
      }
    }
  }

  let bestWindow: TimeAnalysisSummary["bestWindow"] = {
    w: -1,
    h: -1,
    score: 0,
    sampleCount: 0,
    coveredHours: 0,
    confidence: "none",
  };

  for (let w = 0; w < 7; w += 1) {
    for (let h = 0; h < 22; h += 1) {
      let score = 0;
      let sampleCount = 0;
      let coveredHours = 0;

      for (let dh = 0; dh < 3; dh += 1) {
        const cell = grid[w][h + dh];
        if (cell.count > 0 && cell.medianPlay !== null) {
          score += cell.medianPlay * cell.count;
          sampleCount += cell.count;
          coveredHours += 1;
        }
      }

      if (sampleCount >= 3 && score > bestWindow.score) {
        bestWindow = {
          w,
          h,
          score,
          sampleCount,
          coveredHours,
          confidence: "low",
        };
      }
    }
  }

  if (bestWindow.w !== -1) {
    const enoughWindowSamples = bestWindow.sampleCount >= 3;
    const enoughHourCoverage = bestWindow.coveredHours >= 2;
    const enoughOverallData = totalEligible >= 6;

    bestWindow.confidence =
      enoughWindowSamples && enoughHourCoverage && enoughOverallData ? "high" : "low";
  }

  return {
    grid,
    maxMedianPlay,
    bestWindow,
    totalWithPlay: reportsWithPlay.length,
    totalEligible,
    missingPublishedAtCount,
    invalidPublishedAtCount,
  };
}
