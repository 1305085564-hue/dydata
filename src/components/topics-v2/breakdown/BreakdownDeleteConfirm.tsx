import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function BreakdownDeleteConfirm({
  deleteErrorMsg,
  isDeleting,
  handleDeleteSubmit,
  setDrawerMode,
}: {
  deleteErrorMsg: string | null;
  isDeleting: boolean;
  handleDeleteSubmit: () => Promise<void>;
  setDrawerMode: (mode: "detail" | "edit" | "confirm_delete") => void;
}) {
  return (
          <div className="flex min-h-0 flex-1 flex-col justify-between overflow-hidden">
            <Card variant="cushion" className="space-y-3 p-4 gap-0">
              <div className="flex items-center gap-2 text-status-danger font-normal text-[14px]">
                <AlertTriangle className="size-4" />
                <span>确认移出干货选题库？</span>
              </div>
              <p className="leading-relaxed">
                移出后该选题将停止在员工选题库中展示，但历史作品数据与复盘关联完整保留。
              </p>
              {deleteErrorMsg && (
                <p className="text-[12px] text-status-danger font-normal">{deleteErrorMsg}</p>
              )}
            </Card>

            <div className="border-t border-[#E2E2DF] pt-3 flex justify-end gap-2 shrink-0">
              <Button
                type="button"
                variant="secondary"
                size="m"
                onClick={() => setDrawerMode("detail")}
              >
                取消
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="m"
                disabled={isDeleting}
                onClick={() => void handleDeleteSubmit()}
              >
                {isDeleting ? "移出中..." : "确认移出"}
              </Button>
            </div>
          </div>
  );
}
