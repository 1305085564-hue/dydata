"use client";

import type { AiConfigBundle } from "../hooks/use-ai-config";
import { useAvailabilityReport } from "../hooks/use-availability";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface BusinessAssuranceViewProps {
  bundle: AiConfigBundle | null;
  onGoToSupply: (modelId: string) => void;
}

export function BusinessAssuranceView({
  bundle,
  onGoToSupply,
}: BusinessAssuranceViewProps) {
  const report = useAvailabilityReport(bundle);
  const assurances = report?.businessAssurances ?? [];
  const outageCount = assurances.filter((item) => item.status === "outage").length;

  if (!bundle || assurances.length === 0) {
    return (
      <EmptyState
        className="rounded-xl border border-[#E2E2DF] bg-white p-8 shadow-input"
        title="暂无活跃业务功能配置"
        description="所有在册业务均可在上方「业务功能调度」中分配与管理模型。"
      />
    );
  }

  return (
    <div className="space-y-2">
      {/* 顶部轻量概览摘要（裸铺无外壳） */}
      <div className="flex items-center justify-between px-1 text-[12px] text-[#78716C]">
        <span>全站已接入 {assurances.length} 项在册业务功能守护</span>
        {outageCount > 0 ? (
          <span className="text-[#C0685C] font-medium">
            ⚠️ 检测到 {outageCount} 项业务面临断供，请立即更换模型或修复渠道
          </span>
        ) : (
          <span className="text-[#4F805C]">✦ 全部业务均有可用专线支撑</span>
        )}
      </div>

      {/* 主数据表格（L2 独立白底托盘，发丝排版） */}
      <div className="rounded-xl border border-[#E2E2DF] bg-white overflow-hidden shadow-input">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-[#E2E2DF]/60 bg-[#FCFCFB]">
              <TableHead className="w-[200px] text-[12px] font-normal text-[#78716C] h-9 px-4">
                业务功能
              </TableHead>
              <TableHead className="w-[220px] text-[12px] font-normal text-[#78716C] h-9 px-3">
                支撑模型
              </TableHead>
              <TableHead className="text-[12px] font-normal text-[#78716C] h-9 px-3">
                专线冗余与健康度
              </TableHead>
              <TableHead className="w-[140px] text-right text-[12px] font-normal text-[#78716C] h-9 px-4">
                操作
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assurances.map((item) => {
              const isOutage = item.status === "outage";
              const isDegraded = item.status === "degraded";

              return (
                <TableRow
                  key={item.key}
                  className={cn(
                    "transition-colors border-b border-[#E2E2DF]/60",
                    isOutage
                      ? "bg-[#C0685C]/5 hover:bg-[#C0685C]/10"
                      : "hover:bg-[#FCFCFB]"
                  )}
                >
                  {/* 业务功能列 */}
                  <TableCell className="px-4 py-3 align-middle">
                    <div className="flex flex-col">
                      <span className="text-[14px] font-medium text-[#1F1E1D]">
                        {item.label}
                      </span>
                      <span className="text-[12px] font-mono text-[#78716C]">
                        {item.key}
                      </span>
                    </div>
                  </TableCell>

                  {/* 支撑模型列 */}
                  <TableCell className="px-3 py-3 align-middle">
                    <div className="flex flex-col">
                      <span className="text-[13px] font-normal text-[#1F1E1D]">
                        {item.modelDisplayName}
                      </span>
                      {item.resolvedModelId && (
                        <span className="text-[12px] font-mono text-[#78716C]">
                          {item.resolvedModelId}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  {/* 专线冗余与健康度列 */}
                  <TableCell className="px-3 py-3 align-middle">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {isOutage ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[12px] bg-[#C0685C]/10 text-[#C0685C] font-medium">
                          断供
                        </span>
                      ) : isDegraded ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[12px] bg-[#E29A3B]/10 text-[#B87024] font-medium">
                          降级
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[12px] bg-[#6FAA7D]/10 text-[#4F805C] font-medium">
                          正常
                        </span>
                      )}

                      <span
                        className={cn(
                          "text-[12px] tabular-nums",
                          isOutage ? "text-[#C0685C] font-medium" : "text-[#78716C]"
                        )}
                      >
                        {isOutage
                          ? "0 条可用渠道 · 全部断供"
                          : `${item.schedulableChannelCount} 条可用 · ${item.faultChannelCount} 条故障（共 ${item.totalChannelCount} 条专线）`}
                      </span>
                    </div>
                  </TableCell>

                  {/* 操作列 */}
                  <TableCell className="px-4 py-3 text-right align-middle">
                    {isOutage ? (
                      <Button
                        size="s"
                        className="h-7 text-[12px] bg-[#D97757] hover:bg-[#D97757]/90 text-white font-normal shadow-input shrink-0"
                        onClick={() => onGoToSupply(item.resolvedModelId ?? "")}
                      >
                        去换模型
                      </Button>
                    ) : (
                      <Button
                        size="s"
                        variant="ghost"
                        className="h-7 text-[12px] text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9] font-normal shrink-0"
                        onClick={() => onGoToSupply(item.resolvedModelId ?? "")}
                      >
                        查看供给渠道
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
