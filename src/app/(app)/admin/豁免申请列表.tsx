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
  onHandled?: (requestId: string) => void;
}

function RequestRow({
  request,
  onHandled,
}: {
  request: ExemptionRequestRow;
  onHandled?: (requestId: string) => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handle(decision: "approved" | "rejected") {
    startTransition(async () => {
      const result = await reviewExemptionRequest({
        requestId: request.id,
        decision,
      });

      if (result.error) {
        feedbackToast.error(result.error);
        return;
      }

      feedbackToast.success(
        decision === "approved"
          ? `已批准 ${request.applicant_name} 的豁免申请`
          : `已拒绝 ${request.applicant_name} 的豁免申请`,
      );
      onHandled?.(request.id);
    });
  }

  return (
    <TableRow className="hover:bg-zinc-50">
      <TableCell className="font-medium">{request.applicant_name}</TableCell>
      <TableCell>
        {(CATEGORY_LABELS[request.exemption_category ?? "waive"] ?? "免交") +
          " / " +
          (MODE_LABELS[request.exemption_type] ?? request.exemption_type)}
      </TableCell>
      <TableCell className="max-w-[200px] truncate text-muted-foreground">
        {request.reason ?? "-"}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
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
            className="rounded-xl bg-zinc-950 text-white hover:bg-zinc-800"
          >
            批准
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => handle("rejected")}
            className="rounded-xl border-zinc-200 text-zinc-700 hover:bg-zinc-50"
          >
            拒绝
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function ExemptionRequestList({ requests, onHandled }: Props) {
  const [localRequests, setLocalRequests] = useState(requests);

  useEffect(() => {
    setLocalRequests(requests);
  }, [requests]);

  function handleRequestHandled(requestId: string) {
    setLocalRequests((current) =>
      current.filter((request) => request.id !== requestId),
    );
    onHandled?.(requestId);
  }

  if (localRequests.length === 0) {
    return <p className="text-sm text-zinc-500">暂无待审批申请</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-zinc-50">
          <TableHead className="text-zinc-500 text-[11px] uppercase tracking-wider">
            申请人
          </TableHead>
          <TableHead className="text-zinc-500 text-[11px] uppercase tracking-wider">
            类型
          </TableHead>
          <TableHead className="text-zinc-500 text-[11px] uppercase tracking-wider">
            原因
          </TableHead>
          <TableHead className="text-zinc-500 text-[11px] uppercase tracking-wider">
            申请时间
          </TableHead>
          <TableHead className="text-zinc-500 text-[11px] uppercase tracking-wider">
            操作
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {localRequests.map((request) => (
          <RequestRow
            key={request.id}
            request={request}
            onHandled={handleRequestHandled}
          />
        ))}
      </TableBody>
    </Table>
  );
}

export { ExemptionRequestList as 豁免申请列表 };
