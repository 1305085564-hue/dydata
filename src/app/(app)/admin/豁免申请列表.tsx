"use client";

import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { feedbackToast } from "@/components/ui/feedback-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { reviewExemptionRequest } from "./actions";

const MODE_LABELS: Record<string, string> = {
  yesterday: "昨日豁免",
  range: "多日豁免",
  permanent: "永久豁免",
  single: "昨日豁免",
  "3days": "多日豁免",
  "4days": "多日豁免",
  "5days": "多日豁免",
};

const CATEGORY_LABELS: Record<string, string> = {
  waive: "免交",
  leave: "请假",
};

export interface ExemptionRequestRow {
  id: string;
  applicant_user_id: string;
  applicant_name: string;
  exemption_type: string;
  exemption_category: string | null;
  reason: string | null;
  created_at: string;
}

interface Props {
  requests: ExemptionRequestRow[];
  onHandled?: (request: ExemptionRequestRow, decision: "approved" | "rejected") => void;
  onRestore?: (request: ExemptionRequestRow) => void;
}

function RequestRow({
  request,
  onHandled,
  onRestore,
}: {
  request: ExemptionRequestRow;
  onHandled?: (request: ExemptionRequestRow, decision: "approved" | "rejected") => void;
  onRestore?: (request: ExemptionRequestRow) => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handle(decision: "approved" | "rejected") {
    onHandled?.(request, decision);
    feedbackToast.success(
      decision === "approved"
        ? `已批准 ${request.applicant_name} 的豁免申请`
        : `已拒绝 ${request.applicant_name} 的豁免申请`,
    );

    startTransition(async () => {
      const result = await reviewExemptionRequest({
        requestId: request.id,
        decision,
      });

      if (result.error) {
        onRestore?.(request);
        feedbackToast.error(result.error);
      }
    });
  }

  return (
    <TableRow>
      <TableCell className="font-medium text-zinc-800">{request.applicant_name}</TableCell>
      <TableCell>
        {(CATEGORY_LABELS[request.exemption_category ?? "waive"] ?? "免交") +
          " / " +
          (MODE_LABELS[request.exemption_type] ?? request.exemption_type)}
      </TableCell>
      <TableCell className="max-w-[200px] truncate text-zinc-500">
        {request.reason ?? "-"}
      </TableCell>
      <TableCell className="text-[13px] text-zinc-500">
        {new Date(request.created_at).toLocaleString("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </TableCell>
      <TableCell>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => handle("approved")}
            className="bg-[#D97757] text-white hover:bg-[#C96442]"
          >
            批准
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => handle("rejected")}
            className="border-zinc-200 text-zinc-700 hover:bg-zinc-50"
          >
            拒绝
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function ExemptionRequestList({ requests, onHandled, onRestore }: Props) {
  const [localRequests, setLocalRequests] = useState(requests);

  useEffect(() => {
    setLocalRequests(requests);
  }, [requests]);

  function handleRequestHandled(request: ExemptionRequestRow, decision: "approved" | "rejected") {
    setLocalRequests((current) =>
      current.filter((item) => item.id !== request.id),
    );
    onHandled?.(request, decision);
  }

  function handleRequestRestore(request: ExemptionRequestRow) {
    setLocalRequests((current) => {
      if (current.some((item) => item.id === request.id)) return current;
      return [...current, request].sort(
        (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
      );
    });
    onRestore?.(request);
  }

  if (localRequests.length === 0) {
    return <p className="text-[13px] text-zinc-400">暂无待审批申请</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>申请人</TableHead>
          <TableHead>类型</TableHead>
          <TableHead>原因</TableHead>
          <TableHead>申请时间</TableHead>
          <TableHead>操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {localRequests.map((request) => (
          <RequestRow
            key={request.id}
            request={request}
            onHandled={handleRequestHandled}
            onRestore={handleRequestRestore}
          />
        ))}
      </TableBody>
    </Table>
  );
}

export { ExemptionRequestList as 豁免申请列表 };
