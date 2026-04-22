"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { feedbackToast } from "@/components/ui/feedback-toast";
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
}

function RequestRow({ request }: { request: ExemptionRequestRow }) {
  const [isPending, startTransition] = useTransition();

  function handle(decision: "approved" | "rejected") {
    startTransition(async () => {
      const result = await reviewExemptionRequest({ requestId: request.id, decision });
      if (result.error) {
        feedbackToast.error(result.error);
      } else {
        feedbackToast.success(
          decision === "approved" ? `已批准 ${request.applicant_name} 的豁免申请` : `已拒绝 ${request.applicant_name} 的豁免申请`,
        );
      }
    });
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{request.applicant_name}</TableCell>
      <TableCell>
        {[CATEGORY_LABELS[request.exemption_category ?? "waive"] ?? "免交", MODE_LABELS[request.exemption_type] ?? request.exemption_type].join("｜")}
      </TableCell>
      <TableCell className="max-w-[200px] truncate text-muted-foreground">
        {request.reason ?? "-"}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
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
            variant="outline"
            disabled={isPending}
            onClick={() => handle("approved")}
          >
            批准
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => handle("rejected")}
          >
            拒绝
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function 豁免申请列表({ requests }: Props) {
  if (requests.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无待审批申请</p>;
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
        {requests.map((request) => (
          <RequestRow key={request.id} request={request} />
        ))}
      </TableBody>
    </Table>
  );
}
