import { countWorkQuality } from "@/app/api/admin/collaboration/quality-counts";
import type {
  CollaborationAccount,
  CollaborationMonthDataset,
  CollaborationProfile,
  CollaborationReport,
  TalentAccount,
  TalentRow,
  VideoSnapshotMetrics,
} from "./types";
import {
  accountMap,
  asCount,
  buildPerformanceMetrics,
  buildSummary,
  countHits,
  fromStatsStart,
  isSelfHandled,
  profileNameMap,
} from "./report-rules";
import { buildOperators, buildStaff, pickRateMetrics } from "./role-metrics";

export function buildCollaborationPageData(
  dataset: CollaborationMonthDataset,
  staffRole: "writer" | "editor" | null = null,
  onlyUserId?: string,
) {
  const operators = buildOperators(
    dataset.currentRows,
    dataset.previousRows,
    dataset.profiles,
    dataset.accounts,
    dataset.historyRows ?? [...dataset.currentRows, ...dataset.previousRows],
    dataset.videoSnapshots,
  );
  const historyRows = dataset.historyRows ?? [...dataset.currentRows, ...dataset.previousRows];
  const talents = buildTalents(dataset.currentRows, dataset.profiles, dataset.accounts, historyRows, dataset.videoSnapshots);
  const staff = staffRole
    ? buildStaff(
        dataset.currentRows,
        staffRole,
        dataset.profiles,
        dataset.accounts,
        dataset.writerCertifications,
        dataset.videoSnapshots,
        dataset.videoTopicTags,
      )
    : [];

  return {
    summary: buildSummary(dataset.currentRows),
    operators: onlyUserId ? operators.filter((row) => row.userId === onlyUserId) : operators,
    talents: onlyUserId ? talents.filter((row) => row.userId === onlyUserId) : talents,
    staff: onlyUserId ? staff.filter((row) => row.userId === onlyUserId) : staff,
  };
}
export function buildTalents(
  rows: CollaborationReport[],
  profiles: CollaborationProfile[],
  accounts: CollaborationAccount[],
  historyRows: CollaborationReport[] = rows,
  snapshots: Map<string, VideoSnapshotMetrics> = new Map(), // gate:transient-map 函数内临时聚合，随调用栈释放
): TalentRow[] {
  const names = profileNameMap(profiles);
  const accountsById = accountMap(accounts);
  const scopedRows = fromStatsStart(rows);

  const talentAccountsByUser = new Map<string, Set<string>>(); // gate:transient-map 函数内临时聚合，随调用栈释放
  for (const account of accounts) {
    if (!account.profile_id) continue;
    const set = talentAccountsByUser.get(account.profile_id) ?? new Set();
    set.add(account.id);
    talentAccountsByUser.set(account.profile_id, set);
  }

  if (talentAccountsByUser.size === 0) return [];

  return Array.from(talentAccountsByUser.entries())
    .map(([userId, ownAccountIds]) => {
      const talentRows = scopedRows.filter((row) => ownAccountIds.has(row.account_id));
      if (talentRows.length === 0) return null;
      const totalPlay = talentRows.reduce((sum, row) => sum + asCount(row.play_count), 0);
      const talentAccounts: TalentAccount[] = Array.from(ownAccountIds)
        .map((accountId) => {
          const accountRows = talentRows.filter((row) => row.account_id === accountId);
          if (accountRows.length === 0) return null;
          return {
            accountId,
            accountName: accountsById.get(accountId)?.name?.trim() || "未命名账号",
            reportCount: accountRows.length,
            totalPlay: accountRows.reduce((sum, row) => sum + asCount(row.play_count), 0),
            totalFollowerConvert: accountRows.reduce((sum, row) => sum + asCount(row.follower_convert), 0),
          };
        })
        .filter((a): a is TalentAccount => a !== null)
        .sort((a, b) => b.totalPlay - a.totalPlay || a.accountName.localeCompare(b.accountName, "zh-CN"));

      return {
        userId,
        name: names.get(userId) ?? "未命名成员",
        accountCount: talentAccounts.length,
        reportCount: talentRows.length,
        ...pickRateMetrics(buildPerformanceMetrics(talentRows, snapshots)),
        effectiveCount: countWorkQuality(talentRows).effectiveCount,
        excellentCount: countWorkQuality(talentRows).excellentCount,
        totalPlay,
        avgPlay: talentRows.length > 0 ? Math.floor(totalPlay / talentRows.length) : 0,
        totalFollowerConvert: talentRows.reduce((sum, row) => sum + asCount(row.follower_convert), 0),
        hitCount: countHits(talentRows, fromStatsStart(historyRows)),
        selfHandledCount: talentRows.filter(isSelfHandled).length,
        accounts: talentAccounts,
      };
    })
    .filter((row): row is TalentRow => row !== null)
    .sort((a, b) => b.totalPlay - a.totalPlay || a.name.localeCompare(b.name, "zh-CN"));
}
