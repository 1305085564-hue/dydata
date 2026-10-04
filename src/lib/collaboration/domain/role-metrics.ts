import { countWorkQuality } from "@/app/api/admin/collaboration/quality-counts";
import type {
  CollaborationAccount,
  CollaborationProfile,
  CollaborationReport,
  ContentQualityTopicContext,
  VideoSnapshotMetrics,
  WorkGroupPerformanceMetrics,
  WriterEligibility,
} from "./types";
import {
  accountMap,
  asCount,
  buildPerformanceMetrics,
  countHits,
  fromStatsStart,
  isOtherAccount,
  isSelfHandled,
  monthOverMonth,
  profileNameMap,
  roleUserId,
  unique,
} from "./report-rules";
import { buildContentQualitySummary } from "./quality-rules";

export function buildOperators(
  currentRows: CollaborationReport[],
  previousRows: CollaborationReport[],
  profiles: CollaborationProfile[],
  accounts: CollaborationAccount[],
  historyRows: CollaborationReport[] = [...currentRows, ...previousRows],
  snapshots: Map<string, VideoSnapshotMetrics> = new Map(), // gate:transient-map 函数内临时聚合，随调用栈释放
) {
  const names = profileNameMap(profiles);
  const accountsById = accountMap(accounts);
  const current = fromStatsStart(currentRows).filter(
    (row) => row.operator_user_id && isOtherAccount(accountsById.get(row.account_id), row.operator_user_id),
  );
  const previous = fromStatsStart(previousRows).filter(
    (row) => row.operator_user_id && isOtherAccount(accountsById.get(row.account_id), row.operator_user_id),
  );
  const currentByOperator = new Map<string, CollaborationReport[]>(); // gate:transient-map 函数内临时聚合，随调用栈释放
  const previousByOperator = new Map<string, CollaborationReport[]>(); // gate:transient-map 函数内临时聚合，随调用栈释放

  for (const row of current) {
    const userId = row.operator_user_id!;
    const bucket = currentByOperator.get(userId) ?? [];
    bucket.push(row);
    currentByOperator.set(userId, bucket);
  }
  for (const row of previous) {
    const userId = row.operator_user_id!;
    const bucket = previousByOperator.get(userId) ?? [];
    bucket.push(row);
    previousByOperator.set(userId, bucket);
  }

  return Array.from(currentByOperator.entries())
    .map(([userId, operatorRows]) => {
      const byAccount = new Map<string, CollaborationReport[]>(); // gate:transient-map 函数内临时聚合，随调用栈释放
      for (const row of operatorRows) {
        const bucket = byAccount.get(row.account_id) ?? [];
        bucket.push(row);
        byAccount.set(row.account_id, bucket);
      }
      const totalPlay = operatorRows.reduce((sum, row) => sum + asCount(row.play_count), 0);
      const accountIds = Array.from(byAccount.keys());
      const ownerProfileIds = unique(
        accountIds.map((accountId) => accountsById.get(accountId)?.profile_id),
      );
      const accountRows = Array.from(byAccount.entries())
        .map(([accountId, rows]) => {
          const account = accountsById.get(accountId);
          return {
            accountId,
            accountName: account?.name?.trim() || "未命名账号",
            ownerName: account?.profile_id ? names.get(account.profile_id) ?? "未命名成员" : "未命名成员",
            reportCount: rows.length,
            totalPlay: rows.reduce((sum, row) => sum + asCount(row.play_count), 0),
            totalFollowerConvert: rows.reduce((sum, row) => sum + asCount(row.follower_convert), 0),
          };
        })
        .sort((a, b) => b.totalPlay - a.totalPlay || a.accountName.localeCompare(b.accountName, "zh-CN"));

      return {
        userId,
        name: names.get(userId) ?? "未命名成员",
        reportCount: operatorRows.length,
        ...pickRateMetrics(buildPerformanceMetrics(operatorRows, snapshots)),
        effectiveCount: countWorkQuality(operatorRows).effectiveCount,
        excellentCount: countWorkQuality(operatorRows).excellentCount,
        totalPlay,
        avgPlay: Math.floor(totalPlay / operatorRows.length),
        totalFollowerConvert: operatorRows.reduce((sum, row) => sum + asCount(row.follower_convert), 0),
        // 候选作品只算该运营负责的记录，历史样本要覆盖同账号所有日报，不能随责任人补录而漂移。
        hitCount: countHits(operatorRows, fromStatsStart(historyRows)),
        momChange: monthOverMonth(totalPlay, previousByOperator.get(userId) ?? []),
        accountCount: accountIds.length,
        operatedProfileCount: ownerProfileIds.length,
        accounts: accountRows,
      };
    })
    .sort((a, b) => b.totalPlay - a.totalPlay || a.name.localeCompare(b.name, "zh-CN"));
}

export function buildStaff(
  rows: CollaborationReport[],
  role: "writer" | "editor",
  profiles: CollaborationProfile[],
  accounts: CollaborationAccount[],
  certifications: WriterEligibility[] = [],
  snapshots: Map<string, VideoSnapshotMetrics> = new Map(), // gate:transient-map 函数内临时聚合，随调用栈释放
  qualityTopics: ContentQualityTopicContext = { state: "error", tags: new Map() }, // gate:transient-map 函数内临时聚合，随调用栈释放
) {
  const scopedRows = fromStatsStart(rows).filter((row) => roleUserId(row, role));
  const names = profileNameMap(profiles);
  const accountsById = accountMap(accounts);
  const byStaff = new Map<string, CollaborationReport[]>(); // gate:transient-map 函数内临时聚合，随调用栈释放
  const certifiedWriters = new Map(certifications.filter((c) => c.certified).map((c) => [c.userId, c])); // gate:transient-map 函数内临时聚合，随调用栈释放
  if (role === "writer") {
    for (const id of certifiedWriters.keys()) byStaff.set(id, []);
  }

  for (const row of scopedRows) {
    const userId = roleUserId(row, role)!;
    if (role === "editor" && !isOtherAccount(accountsById.get(row.account_id), userId)) continue;
    // 无论是否认证，有文案署名产出即统计真实作品与播放数据
    const bucket = byStaff.get(userId) ?? [];
    bucket.push(row);
    byStaff.set(userId, bucket);
  }

  return Array.from(byStaff.entries())
    .map(([userId, staffRows]) => {
      const totalPlay = staffRows.reduce((sum, row) => sum + asCount(row.play_count), 0);
      const accountIds = unique(staffRows.map((row) => row.account_id));
      const involvedAccounts = accountIds
        .map((accountId) => ({
          accountId,
          accountName: accountsById.get(accountId)?.name?.trim() || "未命名账号",
        }))
        .sort((a, b) => a.accountName.localeCompare(b.accountName, "zh-CN"));
      const works = [...staffRows]
        .sort((a, b) => b.report_date.localeCompare(a.report_date) || b.id.localeCompare(a.id))
        .map((row) => ({
          reportId: row.id,
          reportDate: row.report_date,
          title: row.title?.trim() || "未命名作品",
          accountName: accountsById.get(row.account_id)?.name?.trim() || "未命名账号",
          playCount: row.play_count,
          dataSource: row.data_source ?? null,
        }));
      const quality = countWorkQuality(staffRows);
      const isCertified = role === "writer" ? certifiedWriters.has(userId) : true;
      return {
        userId,
        name: names.get(userId) ?? "未命名成员",
        reportCount: staffRows.length,
        ...pickRateMetrics(buildPerformanceMetrics(staffRows, snapshots)),
        effectiveCount: quality.effectiveCount,
        excellentCount: quality.excellentCount,
        billingCount: role === "writer" ? (isCertified ? quality.billingCount : null) : quality.billingCount,
        certifiedByName: role === "writer" ? certifiedWriters.get(userId)?.certifiedByName ?? null : null,
        isCertified,
        totalPlay,
        avgPlay: staffRows.length ? Math.floor(totalPlay / staffRows.length) : 0,
        selfHandledCount: staffRows.filter(isSelfHandled).length,
        involvedAccounts,
        involvedAccountTotal: involvedAccounts.length,
        recentWorks: works.slice(0, 3),
        works,
        writerQuality: role === "writer"
          ? {
              state: qualityTopics.state,
              summary: qualityTopics.state === "ready"
                ? buildContentQualitySummary(staffRows, snapshots, qualityTopics)
                : null,
            }
          : undefined,
      };
    })
    .sort((a, b) => b.reportCount - a.reportCount || a.name.localeCompare(b.name, "zh-CN"));
}
export function pickRateMetrics(metrics: WorkGroupPerformanceMetrics) {
  return {
    followerConversionRate: metrics.followerConversionRate,
    interactionRate: metrics.interactionRate,
  };
}

export type StaffRow = ReturnType<typeof buildStaff>[number];
export type OperatorRow = ReturnType<typeof buildOperators>[number];
