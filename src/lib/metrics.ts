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

export type BenchmarkMatch = {
  accountId: string
  profileId: string
  reason: string
  id?: string
  profile_id?: string
  name?: string
}

export type BenchmarkResult = {
  sameTagBest: BenchmarkMatch | null
  weakestDimBest: BenchmarkMatch | null
  recentRiser: BenchmarkMatch | null
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

function normalizeTag(value: string | null | undefined) {
  return value?.trim() ?? ""
}

function buildBenchmarkMatch(
  account: MetricsAccount,
  reason: string
): BenchmarkMatch {
  return {
    accountId: account.id,
    profileId: account.profile_id,
    reason,
    id: account.id,
    profile_id: account.profile_id,
    name: account.name,
  }
}

function groupReportsByAccount(reports: MetricsReport[]) {
  return reports.reduce(
    (acc, report) => {
      const current = acc.get(report.account_id)

      if (current) {
        current.push(report)
      } else {
        acc.set(report.account_id, [report])
      }

      return acc
    },
    new Map<string, MetricsReport[]>()
  )
}

function getAveragePlayCount(reports: MetricsReport[]) {
  if (reports.length === 0) {
    return null
  }

  const total = reports.reduce((sum, report) => sum + toSafeNumber(report.play_count), 0)
  return total / reports.length
}

function getWeakestDimensionKey(selfReports: MetricsReport[], teamReports: MetricsReport[]) {
  const dimensionScores = calcDimensionScores(selfReports, teamReports)

  return (Object.entries(dimensionScores).sort((left, right) => left[1].value - right[1].value)[0]?.[0] ??
    null) as keyof typeof dimensionScores | null
}

function toDayStart(value: string) {
  const date = new Date(`${value}T00:00:00`)
  date.setHours(0, 0, 0, 0)
  return date
}

function getDayDiff(latestDate: Date, targetDate: Date) {
  return Math.floor((latestDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24))
}

function getRecentGrowthRate(reports: MetricsReport[]) {
  if (reports.length === 0) {
    return null
  }

  const latestDate = reports.reduce((current, report) => {
    const reportDate = toDayStart(report.report_date)
    return reportDate > current ? reportDate : current
  }, toDayStart(reports[0].report_date))

  let recentSum = 0
  let recentCount = 0
  let previousSum = 0
  let previousCount = 0

  for (const report of reports) {
    const diff = getDayDiff(latestDate, toDayStart(report.report_date))

    if (diff >= 0 && diff <= 6) {
      recentSum += toSafeNumber(report.play_count)
      recentCount += 1
      continue
    }

    if (diff >= 7 && diff <= 13) {
      previousSum += toSafeNumber(report.play_count)
      previousCount += 1
    }
  }

  if (recentCount === 0 || previousCount === 0) {
    return null
  }

  const recentAvg = recentSum / recentCount
  const previousAvg = previousSum / previousCount

  if (previousAvg <= 0) {
    return null
  }

  return (recentAvg - previousAvg) / previousAvg
}

export function findBenchmarks(
  selfReports: MetricsReport[],
  tags: string[],
  teamReports: MetricsReport[],
  accounts: MetricsAccount[]
): BenchmarkResult {
  const selfProfileId = selfReports[0]?.user_id ?? null
  const normalizedTagSet = new Set(tags.map(normalizeTag).filter(Boolean))
  const reportsByAccountId = groupReportsByAccount(teamReports)
  const weakestDimension = getWeakestDimensionKey(selfReports, teamReports)
  const candidateAccounts = accounts.filter((account) => account.profile_id !== selfProfileId)

  const sameTagCandidates = candidateAccounts.filter((account) => {
    if (normalizedTagSet.size === 0) {
      return false
    }

    return [account.content_direction, account.presentation_format]
      .map(normalizeTag)
      .filter(Boolean)
      .some((value) => normalizedTagSet.has(value))
  })

  const rankedSameTagCandidates = sameTagCandidates
    .map((account) => ({
      account,
      averagePlayCount: getAveragePlayCount(reportsByAccountId.get(account.id) ?? []),
    }))
    .sort((left, right) => {
      if (left.averagePlayCount === null && right.averagePlayCount === null) {
        return 0
      }

      if (left.averagePlayCount === null) {
        return 1
      }

      if (right.averagePlayCount === null) {
        return -1
      }

      return right.averagePlayCount - left.averagePlayCount
    })

  const sameTagBestAccount = rankedSameTagCandidates[0]?.account ?? null
  const sameTagBest = sameTagBestAccount
    ? buildBenchmarkMatch(sameTagBestAccount, "同内容标签账号里，近30天平均播放最高")
    : null

  const weakestDimBest = weakestDimension
    ? candidateAccounts
        .map((account) => {
          const accountReports = reportsByAccountId.get(account.id) ?? []
          const score = calcDimensionScores(accountReports, teamReports)[weakestDimension]

          return {
            account,
            score: score.self,
          }
        })
        .sort((left, right) => right.score - left.score)[0]?.account ?? null
    : null

  const recentRiserAccount = candidateAccounts
    .map((account) => ({
      account,
      growthRate: getRecentGrowthRate(reportsByAccountId.get(account.id) ?? []),
    }))
    .filter((item): item is { account: MetricsAccount; growthRate: number } => item.growthRate !== null)
    .sort((left, right) => right.growthRate - left.growthRate)[0]?.account ?? null

  return {
    sameTagBest,
    weakestDimBest:
      weakestDimBest && weakestDimension
        ? buildBenchmarkMatch(
            weakestDimBest,
            `你的最弱维度是 ${weakestDimension}，该账号在该维度团队最强`
          )
        : null,
    recentRiser: recentRiserAccount
      ? buildBenchmarkMatch(recentRiserAccount, "近7天较前7天平均播放增幅最高")
      : null,
  }
}
