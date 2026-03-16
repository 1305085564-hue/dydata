export function calcInteractionScore(
  likes: number,
  comments: number,
  shares: number,
  favorites: number
) {
  return Number(
    (
      comments * 0.35 +
      shares * 0.25 +
      likes * 0.25 +
      favorites * 0.15
    ).toFixed(2)
  )
}

function toSafeNumber(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : 0
}

export function parsePercentText(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0
  }

  if (typeof value !== "string") {
    return 0
  }

  const normalized = value.replace(/%/g, "").trim()

  if (!normalized) {
    return 0
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

export type RateSource = {
  play_count?: number | null
  likes?: number | null
  comments?: number | null
  shares?: number | null
  favorites?: number | null
  follower_gain?: number | null
}

export type CalculatedRates = {
  likeRate: number
  commentRate: number
  shareRate: number
  saveRate: number
  followerRate: number
}

export type MetricsReport = {
  user_id: string
  account_id: string
  report_date: string
  play_count: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  favorites: number | null
  follower_gain: number | null
  completion_rate: string | null
  completion_rate_5s: string | null
}

export type MetricsAccount = {
  id: string
  profile_id: string
  name: string
  content_direction: string | null
  presentation_format: string | null
}

export type DimensionScore = {
  value: number
  self: number
  team: number
}

export function calcRates(source: RateSource): CalculatedRates {
  const playCount = toSafeNumber(source.play_count)

  if (playCount <= 0) {
    return {
      likeRate: 0,
      commentRate: 0,
      shareRate: 0,
      saveRate: 0,
      followerRate: 0,
    }
  }

  const calcRate = (value: number | null | undefined) => {
    return (toSafeNumber(value) / playCount) * 100
  }

  return {
    likeRate: calcRate(source.likes),
    commentRate: calcRate(source.comments),
    shareRate: calcRate(source.shares),
    saveRate: calcRate(source.favorites),
    followerRate: calcRate(source.follower_gain),
  }
}

function getAverageRates(reports: MetricsReport[]) {
  if (reports.length === 0) {
    return {
      likeRate: 0,
      commentRate: 0,
      shareRate: 0,
      saveRate: 0,
      followerRate: 0,
      completionRate: 0,
      completionRate5s: 0,
    }
  }

  const totals = reports.reduce(
    (acc, report) => {
      const rates = calcRates(report)

      acc.likeRate += rates.likeRate
      acc.commentRate += rates.commentRate
      acc.shareRate += rates.shareRate
      acc.saveRate += rates.saveRate
      acc.followerRate += rates.followerRate
      acc.completionRate += parsePercentText(report.completion_rate)
      acc.completionRate5s += parsePercentText(report.completion_rate_5s)

      return acc
    },
    {
      likeRate: 0,
      commentRate: 0,
      shareRate: 0,
      saveRate: 0,
      followerRate: 0,
      completionRate: 0,
      completionRate5s: 0,
    }
  )

  return {
    likeRate: totals.likeRate / reports.length,
    commentRate: totals.commentRate / reports.length,
    shareRate: totals.shareRate / reports.length,
    saveRate: totals.saveRate / reports.length,
    followerRate: totals.followerRate / reports.length,
    completionRate: totals.completionRate / reports.length,
    completionRate5s: totals.completionRate5s / reports.length,
  }
}

export function calcDimensionScores(selfReports: MetricsReport[], teamReports: MetricsReport[]) {
  const self = getAverageRates(selfReports)
  const team = getAverageRates(teamReports)

  return {
    likeRate: {
      self: self.likeRate,
      team: team.likeRate,
      value: self.likeRate - team.likeRate,
    },
    commentRate: {
      self: self.commentRate,
      team: team.commentRate,
      value: self.commentRate - team.commentRate,
    },
    shareRate: {
      self: self.shareRate,
      team: team.shareRate,
      value: self.shareRate - team.shareRate,
    },
    saveRate: {
      self: self.saveRate,
      team: team.saveRate,
      value: self.saveRate - team.saveRate,
    },
    followerRate: {
      self: self.followerRate,
      team: team.followerRate,
      value: self.followerRate - team.followerRate,
    },
    completionRate: {
      self: self.completionRate,
      team: team.completionRate,
      value: self.completionRate - team.completionRate,
    },
    completionRate5s: {
      self: self.completionRate5s,
      team: team.completionRate5s,
      value: self.completionRate5s - team.completionRate5s,
    },
  } satisfies Record<string, DimensionScore>
}

export function findBenchmarks(
  _selfReports: MetricsReport[],
  tags: string[],
  _teamReports: MetricsReport[],
  accounts: MetricsAccount[]
) {
  const normalizedTagSet = new Set(tags.map((tag) => tag.trim()).filter(Boolean))

  const sameTagBest =
    accounts.find((account) => {
      const values = [account.content_direction, account.presentation_format]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))

      return values.some((value) => normalizedTagSet.has(value))
    }) ?? null

  return {
    sameTagBest,
  }
}
