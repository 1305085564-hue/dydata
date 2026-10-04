import { workGroupSlotForKind, type WorkGroupKind, type WorkGroupRow } from "@/lib/work-groups";
import type { ContentQualitySummary } from "@/lib/collaboration/content-quality-contract";
import type {
  CollaborationMonthDataset,
  CollaborationReport,
  WorkGroupAggregate,
  WorkGroupDetailView,
  WorkGroupMemberRow,
  WorkGroupSummaryRow,
  WorkGroupViews,
  VideoSnapshotMetrics,
} from "./types";
import {
  accountMap,
  buildPerformanceMetrics,
  fromStatsStart,
  isOtherAccount,
} from "./report-rules";
import { buildContentQualitySummary } from "./quality-rules";

/**
 * 「按团队」的组列表与组详情：指标与视频复盘抽屉同源（每作品最新 24h 快照），先加总再相除。
 *
 * - 署名归属与按岗位口径一致：文案 = script_author 署名（含本人账号）；达人 = 本人名下账号的日报；
 *   运营 = operator 署名且为他人账号作品。一人兼多岗时各岗位各算各的。
 * - 编制名单取 `dataset.workGroups.roster`，用 `dataset.visibleUserIds` 裁剪（组员=本公司范围）；
 *   零产出组员照常出行。
 * - 组综合 = 组内全部署名作品一次聚合（比率按合计重算，不是成员比率的平均）。
 * - 历史月份按当前编制回看（本轮不做编制考古）。
 */
export function buildWorkGroupViews(dataset: CollaborationMonthDataset): WorkGroupViews {
  const directory = dataset.workGroups;
  if (!directory || directory.groups.length === 0) {
    return { ready: directory?.ready ?? true, groups: [], details: [] };
  }

  const scope = dataset.visibleUserIds ? new Set(dataset.visibleUserIds) : null;
  const kinds = new Set(directory.groups.map((group) => group.kind));
  const snapshots = dataset.videoSnapshots ?? new Map<string, VideoSnapshotMetrics>(); // gate:transient-map 函数内临时聚合，随调用栈释放
  const accountsById = accountMap(dataset.accounts);
  const scopedRows = fromStatsStart(dataset.currentRows);

  const writerRows = new Map<string, CollaborationReport[]>(); // gate:transient-map 函数内临时聚合，随调用栈释放
  const talentRows = new Map<string, CollaborationReport[]>(); // gate:transient-map 函数内临时聚合，随调用栈释放
  const operatorRows = new Map<string, CollaborationReport[]>(); // gate:transient-map 函数内临时聚合，随调用栈释放
  const addRow = (map: Map<string, CollaborationReport[]>, userId: string, row: CollaborationReport) => {
    const bucket = map.get(userId) ?? [];
    bucket.push(row);
    map.set(userId, bucket);
  };
  for (const row of scopedRows) {
    if (kinds.has("writer") && row.script_author_user_id) {
      addRow(writerRows, row.script_author_user_id, row);
    }
    if (kinds.has("talent")) {
      const owner = accountsById.get(row.account_id)?.profile_id;
      if (owner) addRow(talentRows, owner, row);
    }
    if (
      kinds.has("operator") &&
      row.operator_user_id &&
      isOtherAccount(accountsById.get(row.account_id), row.operator_user_id)
    ) {
      addRow(operatorRows, row.operator_user_id, row);
    }
  }

  const groups: WorkGroupSummaryRow[] = [];
  const details: WorkGroupDetailView[] = [];
  const ordered = [...directory.groups].sort(
    (a, b) => kindOrder(a.kind) - kindOrder(b.kind) || a.name.localeCompare(b.name, "zh-CN"),
  );

  for (const group of ordered) {
    const roster = directory.roster.filter(
      (member) =>
        (workGroupSlotForKind(group.kind) === "operator" ? member.operatorGroupId : member.peerGroupId) ===
          group.id && (!scope || scope.has(member.id)),
    );
    const rowsMap =
      group.kind === "writer" ? writerRows : group.kind === "talent" ? talentRows : operatorRows;
    const members: WorkGroupMemberRow[] = roster
      .map((member) => {
        const memberRows = rowsMap.get(member.id) ?? [];
        return {
          userId: member.id,
          name: member.name?.trim() || "未命名成员",
          ...buildPerformanceMetrics(memberRows, snapshots),
          contentQuality: group.kind === "writer" && dataset.videoTopicTags
            ? buildContentQualitySummary(
                memberRows,
                snapshots,
                dataset.videoTopicTags,
              )
            : null,
        };
      })
      .sort(
        (a, b) =>
          b.totalPlay - a.totalPlay || b.reportCount - a.reportCount || a.name.localeCompare(b.name, "zh-CN"),
      );
    const groupRows = members.flatMap((member) => rowsMap.get(member.userId) ?? []);
    pushGroup(
      groups,
      details,
      group,
      members,
      buildPerformanceMetrics(groupRows, snapshots),
      group.kind === "writer" && dataset.videoTopicTags
        ? buildContentQualitySummary(groupRows, snapshots, dataset.videoTopicTags)
        : null,
    );
  }

  return { ready: true, groups, details };
}

function kindOrder(kind: WorkGroupKind) {
  return kind === "writer" ? 0 : kind === "talent" ? 1 : 2;
}

function pushGroup(
  groups: WorkGroupSummaryRow[],
  details: WorkGroupDetailView[],
  group: WorkGroupRow,
  members: WorkGroupMemberRow[],
  aggregate: WorkGroupAggregate,
  contentQuality: ContentQualitySummary | null,
) {
  const summary: WorkGroupSummaryRow = {
    id: group.id,
    name: group.name,
    kind: group.kind,
    teamId: group.teamId,
    memberCount: members.length,
    aggregate,
    contentQuality,
  };
  groups.push(summary);
  details.push({ summary, members });
}
