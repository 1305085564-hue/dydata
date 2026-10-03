import type React from "react";
import { Button } from "@/components/ui/button";

export function BreakdownEditForm({
  editTitle,
  setEditTitle,
  editHook,
  setEditHook,
  editEmotionTag,
  setEditEmotionTag,
  editAudience,
  setEditAudience,
  editTitleError,
  isSubmittingEdit,
  handleEditSubmit,
  setDrawerMode,
  drawerMode,
}: {
  editTitle: string;
  setEditTitle: (value: string) => void;
  editHook: string;
  setEditHook: (value: string) => void;
  editEmotionTag: string;
  setEditEmotionTag: (value: string) => void;
  editAudience: string;
  setEditAudience: (value: string) => void;
  editTitleError: string;
  isSubmittingEdit: boolean;
  handleEditSubmit: (e: React.FormEvent) => Promise<void>;
  setDrawerMode: (mode: "detail" | "edit" | "confirm_delete") => void;
  drawerMode: "detail" | "edit" | "confirm_delete";
}) {
  return (
    <>
      {/* 抽屉模式视图切换（单层交互 · 零嵌套弹窗） */}
      {drawerMode === "edit" ? (
          <form
            onSubmit={handleEditSubmit}
            className="flex min-h-0 flex-1 flex-col overflow-hidden space-y-4"
          >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              <div>
                <label className="text-[12px] font-normal text-[#78716C] block mb-1">
                  选题标题 *
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full text-[13px] text-[#1F1E1D] rounded-md border border-[#E2E2DF] p-2.5 bg-white/50 shadow-input focus:bg-white focus:outline-none focus:border-[#141413]"
                />
                {editTitleError && (
                  <p className="text-[12px] text-status-danger mt-1">{editTitleError}</p>
                )}
              </div>

              <div>
                <label className="text-[12px] font-normal text-[#78716C] block mb-1">
                  一句话 Hook
                </label>
                <textarea
                  value={editHook}
                  onChange={(e) => setEditHook(e.target.value)}
                  rows={3}
                  className="w-full text-[13px] text-[#1F1E1D] rounded-md border border-[#E2E2DF] p-2.5 bg-white/50 shadow-input focus:bg-white focus:outline-none focus:border-[#141413]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] font-normal text-[#78716C] block mb-1">
                    情绪标签
                  </label>
                  <input
                    type="text"
                    value={editEmotionTag}
                    onChange={(e) => setEditEmotionTag(e.target.value)}
                    className="w-full text-[13px] text-[#1F1E1D] rounded-md border border-[#E2E2DF] p-2.5 bg-white/50 shadow-input focus:bg-white focus:outline-none focus:border-[#141413]"
                  />
                </div>
                <div>
                  <label className="text-[12px] font-normal text-[#78716C] block mb-1">
                    目标受众
                  </label>
                  <input
                    type="text"
                    value={editAudience}
                    onChange={(e) => setEditAudience(e.target.value)}
                    className="w-full text-[13px] text-[#1F1E1D] rounded-md border border-[#E2E2DF] p-2.5 bg-white/50 shadow-input focus:bg-white focus:outline-none focus:border-[#141413]"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-[#E2E2DF] pt-3 flex justify-end gap-2 shrink-0">
              <Button
                type="button"
                variant="secondary"
                size="m"
                onClick={() => setDrawerMode("detail")}
              >
                取消
              </Button>
              <Button type="submit" size="m" disabled={isSubmittingEdit}>
                {isSubmittingEdit ? "保存中..." : "保存修改"}
              </Button>
            </div>
          </form>
      ) : null}
    </>
  );
}
