"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CompassConstellationIllustration, DeskStudyIllustration } from "@/components/editorial/editorial-illustrations";
import { teamMetricColumns } from "./collaboration-quality-hints";
import { goodExcellentText } from "./talent-tab";
import { RoleTable } from "./role-table";
import { DetailToggle } from "./work-group-detail-columns";
import { formatBigNumber, type WorkGroupKind, type WorkGroupSummaryRow } from "@/lib/collaboration/types";

interface WorkGroupListTabProps {
  groups: WorkGroupSummaryRow[];
  ready?: boolean;
  canManage?: boolean;
  onOpenManageDrawer?: () => void;
  onSelectGroup: (groupId: string) => void;
}

export function workGroupKindLabel(kind: WorkGroupKind) {
  return kind === "writer" ? "文案" : kind === "talent" ? "达人" : "运营";
}

/** 工种徽章：管理小队抽屉里用；表格里工种写在小队名下方的灰字里。 */
export function WorkGroupKindBadge({ kind }: { kind: WorkGroupKind }) {
  return (
    <Badge className="border-transparent bg-[#F1F1F0] text-[#78716C]">
      {workGroupKindLabel(kind)}
    </Badge>
  );
}

/** 表格一行 = 小队合计指标 + 名字、工种、人数（拍平成与岗位表同形的行）。 */
type GroupRow = WorkGroupSummaryRow["aggregate"] & {
  id: string;
  name: string;
  kind: WorkGroupKind;
  memberCount: number;
  contentQuality: WorkGroupSummaryRow["contentQuality"];
};

/**
 * 小队列表：一行一个小队，点一行进小队详情。
 * 和四张岗位表同一套表格：列名、口径、悬停说明一致，窄屏改成列表。
 */
export function WorkGroupListTab({
  groups,
  ready = true,
  canManage = false,
  onOpenManageDrawer,
  onSelectGroup,
}: WorkGroupListTabProps) {
  const [showDetail, setShowDetail] = useState(false);

  const rows = useMemo<GroupRow[]>(
    () =>
      groups.map((group) => ({
        ...group.aggregate,
        id: group.id,
        name: group.name,
        kind: group.kind,
        memberCount: group.memberCount,
        contentQuality: group.contentQuality,
      })),
    [groups],
  );

  const withQuality = groups.some((group) => group.contentQuality !== null);
  const columns = useMemo(() => teamMetricColumns<GroupRow>({ showDetail, withQuality }), [showDetail, withQuality]);

  if (!ready) {
    return (
      <EmptyState
        illustration={<CompassConstellationIllustration size={96} />}
        title="小队功能还在上线中"
        description="上线后就能在这里按小队看本月数据。"
      />
    );
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        illustration={<DeskStudyIllustration size={96} />}
        title="本月还没有划分小队"
        description={
          canManage
            ? "点右上角「管理小队」，为一部、二部建文案、达人、运营小队并分配成员。"
            : "团队负责人建好小队后，会在这里显示。"
        }
        action={canManage && onOpenManageDrawer ? { label: "新建小队", onClick: onOpenManageDrawer } : undefined}
      />
    );
  }

  return (
    <div className="space-y-2">
      <div className="hidden sm:block">
        <DetailToggle expanded={showDetail} onToggle={() => setShowDetail((value) => !value)} />
      </div>
      <RoleTable
        rows={rows}
        columns={columns}
        defaultSortKey="totalPlay"
        nameLabel="小队"
        showAvatar={false}
        getId={(row) => row.id}
        getName={(row) => row.name}
        getSub={(row) => `${workGroupKindLabel(row.kind)}小队 · ${row.memberCount} 人`}
        isZero={(row) => row.reportCount === 0}
        rowAriaLabel={(row) => `进入${row.name}小队详情`}
        getMobileSummary={(row) => ({
          primary: formatBigNumber(row.totalPlay),
          secondary: row.contentQuality
            ? `${row.reportCount} 篇 · ${goodExcellentText(row.contentQuality)}`
            : `${row.reportCount} 篇`,
        })}
        onSelectPerson={onSelectGroup}
      />
    </div>
  );
}
