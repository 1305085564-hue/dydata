import dynamic from "next/dynamic";
import type { Dispatch, SetStateAction } from "react";
import type {
  BatchImportParsedRow,
  BatchImportSummary,
  SubTopicItem,
  TopicMoreFiltersState,
  TopicOption,
  TopicPoolItem,
} from "../types";

// Item 8: 按需动态加载重型弹窗与抽屉，避免选题库首屏为尚未使用的弹窗承担体积
const TopicWorkBreakdownDrawer = dynamic(
  () =>
    import("../TopicWorkBreakdownDrawer").then((mod) => mod.TopicWorkBreakdownDrawer),
  { ssr: false },
);

const TopicMoreFiltersDrawer = dynamic(
  () =>
    import("../TopicMoreFiltersDrawer").then((mod) => mod.TopicMoreFiltersDrawer),
  { ssr: false },
);

const TopicCreateModal = dynamic(
  () => import("../TopicCreateModal").then((mod) => mod.TopicCreateModal),
  { ssr: false },
);

interface TopicCreateModalProps {
  isOpen: boolean;
  topics: TopicOption[];
  topicsError?: string | null;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
  canManageTopicLibrary?: boolean;
  onParseFile?: (file: File) => Promise<{
    rows: BatchImportParsedRow[];
    summary: BatchImportSummary;
  }>;
  onConfirmImport?: (rows: BatchImportParsedRow[], fileName?: string | null) => Promise<{
    successCount: number;
    skippedCount: number;
    failedCount: number;
    errors?: Array<{ rowNumber: number; title: string; reason: string }>;
  }>;
}

export function TopicHubDrawers({
  inspectTopicId,
  resolvedPoolItems,
  poolItemCount,
  writingTopicIds,
  hasPrevTopic,
  hasNextTopic,
  handleNavigateTopic,
  currentInspectIndex,
  poolPage,
  poolTotalCount,
  setInspectTopicId,
  setPoolItems,
  setPoolTotalCount,
  handleGoToFeishu,
  currentUserId,
  canManageTopicLibrary,
  isMoreFiltersOpen,
  moreFilters,
  beginPoolQueryChange,
  setPoolPage,
  setMoreFilters,
  setIsMoreFiltersOpen,
  isCreateModalOpen,
  setIsCreateModalOpen,
  topicsOptions,
  topicsOptionsError,
  handleParseImportFile,
  handleConfirmImport,
  refreshAll,
  showToast,
}: {
  inspectTopicId: string | null;
  resolvedPoolItems: TopicPoolItem[];
  poolItemCount: number;
  writingTopicIds: ReadonlySet<string>;
  hasPrevTopic: boolean;
  hasNextTopic: boolean;
  handleNavigateTopic: (direction: "prev" | "next") => Promise<void>;
  currentInspectIndex: number;
  poolPage: number;
  poolTotalCount: number;
  setInspectTopicId: (topicId: string | null) => void;
  setPoolItems: Dispatch<SetStateAction<TopicPoolItem[]>>;
  setPoolTotalCount: Dispatch<SetStateAction<number>>;
  handleGoToFeishu: (topic: SubTopicItem) => Promise<void>;
  currentUserId: string | null;
  canManageTopicLibrary: boolean;
  isMoreFiltersOpen: boolean;
  moreFilters: TopicMoreFiltersState;
  beginPoolQueryChange: () => void;
  setPoolPage: (page: number) => void;
  setMoreFilters: (filters: TopicMoreFiltersState) => void;
  setIsMoreFiltersOpen: (open: boolean) => void;
  isCreateModalOpen: boolean;
  setIsCreateModalOpen: (open: boolean) => void;
  topicsOptions: TopicOption[];
  topicsOptionsError: string | null;
  handleParseImportFile: TopicCreateModalProps["onParseFile"];
  handleConfirmImport: TopicCreateModalProps["onConfirmImport"];
  refreshAll: () => Promise<void>;
  showToast: (text: string, type?: "success" | "error") => void;
}) {
  return (
    <>
      {/* 动态懒加载：选题详情抽屉 */}
      {inspectTopicId && (
        <TopicWorkBreakdownDrawer
          key={inspectTopicId}
          subTopicId={inspectTopicId}
          initialSubTopic={
            (resolvedPoolItems.find((item) => item.id === inspectTopicId) as unknown as SubTopicItem) ?? null
          }
          isWritingByCurrentUser={Boolean(
            resolvedPoolItems.find((item) => item.id === inspectTopicId)?.isWritingByMe ||
              writingTopicIds.has(inspectTopicId),
          )}
          hasPrevTopic={hasPrevTopic}
          hasNextTopic={hasNextTopic}
          onNavigateTopic={handleNavigateTopic}
          currentTopicIndex={
            currentInspectIndex >= 0
              ? (poolPage - 1) * 50 + currentInspectIndex
              : undefined
          }
          totalTopicsCount={poolTotalCount > 0 ? poolTotalCount : poolItemCount}
          onClose={() => {
            setInspectTopicId(null);
            // 深链打开的抽屉关闭后清理 URL，避免刷新重复弹出
            if (typeof window !== "undefined" && window.location.search.includes("topic_id=")) {
              window.history.replaceState({}, "", "/topics");
            }
          }}
          onGoToFeishu={(subTopic) => void handleGoToFeishu(subTopic)}
          currentUserId={currentUserId}
          canManageTopicLibrary={canManageTopicLibrary}
          canReviewContent={canManageTopicLibrary}
          onSubTopicUpdated={(updated) => {
            setPoolItems((prev) =>
              prev.map((item) =>
                item.id === updated.id
                  ? {
                      ...item,
                      title: updated.title,
                      hook: updated.hook,
                      emotion_tag: updated.emotion_tag,
                      audience: updated.audience,
                    }
                  : item,
              ),
            );
          }}
          onSubTopicRemoved={(removedId) => {
            setPoolItems((prev) => prev.filter((item) => item.id !== removedId));
            setPoolTotalCount((count) => Math.max(0, count - 1));
            setInspectTopicId(null);
          }}
        />
      )}

      {/* 动态懒加载：“更多”高级筛选抽屉 */}
      {isMoreFiltersOpen && (
        <TopicMoreFiltersDrawer
          isOpen={isMoreFiltersOpen}
          filters={moreFilters}
          onChange={(newFilters) => {
            beginPoolQueryChange();
            setPoolPage(1);
            setMoreFilters(newFilters);
          }}
          onClose={() => setIsMoreFiltersOpen(false)}
        />
      )}

      {/* 动态懒加载：录入选题与批量导入统一中枢 Modal */}
      {isCreateModalOpen && (
        <TopicCreateModal
          isOpen={isCreateModalOpen}
          topics={topicsOptions}
          topicsError={topicsOptionsError}
          canManageTopicLibrary={canManageTopicLibrary}
          onParseFile={handleParseImportFile}
          onConfirmImport={handleConfirmImport}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={async () => {
            await refreshAll();
            showToast("选题已成功入卷", "success");
          }}
        />
      )}
    </>
  );
}
