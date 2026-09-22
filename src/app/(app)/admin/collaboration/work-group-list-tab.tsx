"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ArrowRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { CompassConstellationIllustration, DeskStudyIllustration } from "@/components/editorial/editorial-illustrations";
import {
  formatBigNumber,
  type WorkGroupSummaryRow,
  type WorkGroupKind,
} from "./types";

interface WorkGroupListTabProps {
  groups: WorkGroupSummaryRow[];
  ready?: boolean;
  canManage?: boolean;
  onOpenManageDrawer?: () => void;
  onSelectGroup: (groupId: string) => void;
}

type SortField = "name" | "memberCount" | "reportCount" | "totalPlay" | "avgPlay";

export function WorkGroupKindBadge({ kind }: { kind: WorkGroupKind }) {
  if (kind === "writer") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11.5px] font-medium bg-[#F1F1F0] text-[#1C1917] border border-[#E2E2DF]/60">
        文案小队
      </span>
    );
  }
  if (kind === "talent") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11.5px] font-medium bg-[#FAF4E8] text-[#8A6A2F] border border-[#8A6A2F]/15">
        达人小队
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11.5px] font-medium bg-[#F0F4F8] text-[#43718E] border border-[#43718E]/15">
      运营小队
    </span>
  );
}

function renderKindPreview(group: WorkGroupSummaryRow) {
  const agg = group.aggregate;
  if (group.kind === "writer") {
    const writerAgg = agg as import("./types").WorkGroupWriterAggregate;
    return (
      <div className="flex items-center justify-end gap-1 text-[12.5px] tabular-nums text-[#292524]">
        <span className="text-[#78716C]">计费:</span>
        <span className="font-medium">{writerAgg.billingCount !== null ? `${writerAgg.billingCount} 篇` : "—"}</span>
      </div>
    );
  }
  if (group.kind === "talent") {
    const talentAgg = agg as import("./types").WorkGroupTalentAggregate;
    return (
      <div className="flex items-center justify-end gap-1 text-[12.5px] tabular-nums text-[#292524]">
        <span className="text-[#78716C]">账号:</span>
        <span className="font-medium">{talentAgg.accountCount} 个</span>
      </div>
    );
  }
  const opAgg = agg as import("./types").WorkGroupOperatorAggregate;
  return (
    <div className="flex items-center justify-end gap-1 text-[12.5px] tabular-nums text-[#292524]">
      <span className="text-[#78716C]">导粉:</span>
      <span className="font-medium">{formatBigNumber(opAgg.totalFollowerConvert)}</span>
    </div>
  );
}

export function WorkGroupListTab({
  groups,
  ready = true,
  canManage = false,
  onOpenManageDrawer,
  onSelectGroup,
}: WorkGroupListTabProps) {
  const [sortField, setSortField] = useState<SortField>("totalPlay");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const list = [...groups];
    list.sort((a, b) => {
      let diff = 0;
      if (sortField === "name") {
        diff = a.name.localeCompare(b.name, "zh-CN");
      } else if (sortField === "memberCount") {
        diff = a.memberCount - b.memberCount;
      } else {
        const aVal = a.aggregate[sortField] ?? 0;
        const bVal = b.aggregate[sortField] ?? 0;
        diff = aVal - bVal;
      }
      return sortOrder === "desc" ? -diff : diff;
    });
    return list;
  }, [groups, sortField, sortOrder]);

  if (!ready) {
    return (
      <div className="py-16 text-center">
        <EmptyState
          illustration={<CompassConstellationIllustration size={96} />}
          title="小队编制功能准备就绪中"
          description="数据库正在同步工种小队结构，待上线后即可在此按小队查看与管理编制。"
        />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="py-16 text-center">
        <EmptyState
          illustration={<DeskStudyIllustration size={96} />}
          title="本月还没有划分工种小队"
          description={
            canManage
              ? "点击上方「管理小队」按钮，即可为一部/二部创建文案、达人与运营小队并分配成员。"
              : "当前团队尚未建立工种小队编制，请联系团队负责人创建。"
          }
          action={
            canManage && onOpenManageDrawer
              ? {
                  label: "新建工种小队",
                  onClick: onOpenManageDrawer,
                }
              : undefined
          }
        />
      </div>
    );
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="size-3 text-[#78716C]/40 ml-1 inline" />;
    }
    return sortOrder === "desc" ? (
      <ArrowDown className="size-3 text-[#1C1917] ml-1 inline" />
    ) : (
      <ArrowUp className="size-3 text-[#1C1917] ml-1 inline" />
    );
  };

  return (
    <div className="rounded-xl bg-white shadow-card-ring overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-transparent hover:bg-transparent border-b border-[#E2E2DF]/60 text-[11px] font-medium uppercase tracking-wider text-[#78716C]">
            <TableHead className="py-2.5 pl-4 pr-2 text-left font-medium text-[#78716C] w-[220px]">
              <button
                type="button"
                onClick={() => handleSort("name")}
                className={`inline-flex items-center justify-start cursor-pointer transition-colors ${
                  sortField === "name" ? "text-[#1C1917] font-medium" : "hover:text-[#1C1917]"
                }`}
              >
                小队名称
                {renderSortIcon("name")}
              </button>
            </TableHead>
            <TableHead className="py-2.5 px-2 text-right font-medium text-[#78716C] w-[100px]">
              <button
                type="button"
                onClick={() => handleSort("memberCount")}
                className={`inline-flex items-center justify-end cursor-pointer transition-colors ${
                  sortField === "memberCount" ? "text-[#1C1917] font-medium" : "hover:text-[#1C1917]"
                }`}
              >
                编制人数
                {renderSortIcon("memberCount")}
              </button>
            </TableHead>
            <TableHead className="py-2.5 px-2 text-right font-medium text-[#78716C] w-[110px]">
              <button
                type="button"
                onClick={() => handleSort("reportCount")}
                className={`inline-flex items-center justify-end cursor-pointer transition-colors ${
                  sortField === "reportCount" ? "text-[#1C1917] font-medium" : "hover:text-[#1C1917]"
                }`}
              >
                本月作品
                {renderSortIcon("reportCount")}
              </button>
            </TableHead>
            <TableHead className="py-2.5 px-2 text-right font-medium text-[#78716C] w-[130px]">
              <button
                type="button"
                onClick={() => handleSort("totalPlay")}
                className={`inline-flex items-center justify-end cursor-pointer transition-colors ${
                  sortField === "totalPlay" ? "text-[#1C1917] font-medium" : "hover:text-[#1C1917]"
                }`}
              >
                总播放量
                {renderSortIcon("totalPlay")}
              </button>
            </TableHead>
            <TableHead className="py-2.5 px-2 text-right font-medium text-[#78716C] w-[120px]">
              <button
                type="button"
                onClick={() => handleSort("avgPlay")}
                className={`inline-flex items-center justify-end cursor-pointer transition-colors ${
                  sortField === "avgPlay" ? "text-[#1C1917] font-medium" : "hover:text-[#1C1917]"
                }`}
              >
                条均播放
                {renderSortIcon("avgPlay")}
              </button>
            </TableHead>
            <TableHead className="py-2.5 px-4 text-right font-medium text-[#78716C] w-[140px]">
              工种关键指标
            </TableHead>
            <TableHead className="py-2.5 pl-2 pr-4 text-right font-medium text-[#78716C] w-[90px]">
              操作
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="text-[13px]">
          {sorted.map((group) => (
            <TableRow
              key={group.id}
              tabIndex={0}
              role="button"
              aria-label={`进入${group.name}小队详情`}
              className="border-b border-[#E2E2DF]/70 hover:bg-[#F7F7F6] focus:bg-[#F7F7F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97757] focus-visible:ring-offset-1 transition-colors cursor-pointer group"
              onClick={() => onSelectGroup(group.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSelectGroup(group.id);
              }}
            >
              <TableCell className="py-3 pl-4 pr-2 font-medium text-[#1C1917]">
                <div className="flex items-center gap-2">
                  <span className="truncate max-w-[140px]">{group.name}</span>
                  <WorkGroupKindBadge kind={group.kind} />
                </div>
              </TableCell>
              <TableCell className="py-3 px-2 text-right tabular-nums text-[#292524]">
                {group.memberCount} 人
              </TableCell>
              <TableCell className="py-3 px-2 text-right tabular-nums text-[#292524] font-medium">
                {group.aggregate.reportCount} 篇/条
              </TableCell>
              <TableCell className="py-3 px-2 text-right tabular-nums text-[#292524]">
                {formatBigNumber(group.aggregate.totalPlay)}
              </TableCell>
              <TableCell className="py-3 px-2 text-right tabular-nums text-[#292524]">
                {formatBigNumber(group.aggregate.avgPlay)}
              </TableCell>
              <TableCell className="py-3 px-4 text-right">
                {renderKindPreview(group)}
              </TableCell>
              <TableCell className="py-3 pl-2 pr-4 text-right">
                <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[#78716C] group-hover:text-[#D97757] transition-colors">
                  进入
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
