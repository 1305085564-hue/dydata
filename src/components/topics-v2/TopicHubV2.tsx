"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AppShell } from "@/components/app-shell";
import type { V2TopicLibraryBootstrap } from "@/lib/topics/v2-client-contract";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { useTopicHubState, useTopicHubNavigation } from "@/lib/topics/domain/hub-state";
import { useTopicHubData } from "@/lib/topics/data/hub";
import { useTopicHubActions } from "@/lib/topics/data/hub-actions";
import { TopicHubToolbar } from "./hub/TopicHubToolbar";
import { TopicHubContent } from "./hub/TopicHubContent";
import { TopicHubDrawers } from "./hub/TopicHubDrawers";

export function TopicHubV2({
  canManageTopicLibrary = false,
  feishuWorkspaceUrl = null,
  initialBootstrapData = null,
  initialTopicId = null,
}: {
  canManageTopicLibrary?: boolean;
  feishuWorkspaceUrl?: string | null;
  initialBootstrapData?: V2TopicLibraryBootstrap | null;
  /** /topics?topic_id= 深链：服务端归一化后传入，挂载即打开对应选题抽屉 */
  initialTopicId?: string | null;
}) {
  const state = useTopicHubState(initialBootstrapData, initialTopicId);
  const {
    fetchActiveData,
    fetchPoolPage,
    refreshAll,
    handleParseImportFile,
    handleConfirmImport,
  } = useTopicHubData({ initialBootstrapData, state });

  // Toast 轻反馈（接入全站 feedbackToast 规范）
  const showToast = (text: string, type: "success" | "error" = "success") => {
    if (type === "success") {
      feedbackToast.success(text);
    } else {
      feedbackToast.error(text);
    }
  };

  const { handleGoToFeishu } = useTopicHubActions({
    state,
    refreshAll,
    feishuWorkspaceUrl,
    showToast,
  });
  const {
    currentInspectIndex,
    hasPrevTopic,
    hasNextTopic,
    handleNavigateTopic,
  } = useTopicHubNavigation({ state, fetchPoolPage, showToast });

  if (state.membershipRequired) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 text-center gap-0">
          <EmptyState
            title="请先申请加入团队"
            description="当前账号还没有有效团队归属，选题库和创作协作暂不可用。"
            action={{
              label: "去工作台申请加入团队",
              href: "/dashboard",
            }}
          />
        </Card>
      </div>
    );
  }

  return (
    <AppShell
      eyebrow="选题库"
      title="灵感手稿 · 选题库"
      description="选定后在飞书创作，数据为内容立卷"
      actions={
        <TopicHubToolbar
          activeLoading={state.activeLoading}
          poolLoading={state.poolLoading}
          onRefresh={() => void refreshAll()}
        />
      }
      width="wide"
    >
      <TopicHubContent
        activeTopics={state.activeTopics}
        activeLoading={state.activeLoading}
        activeError={state.activeError}
        fetchActiveData={fetchActiveData}
        resolvedPoolItems={state.resolvedPoolItems}
        topicsOptions={state.topicsOptions}
        poolLoading={state.poolLoading}
        setPoolLoading={state.setPoolLoading}
        poolError={state.poolError}
        poolTotalCount={state.poolTotalCount}
        poolSearchQuery={state.poolSearchQuery}
        poolPage={state.poolPage}
        poolView={state.poolView}
        poolTimeRange={state.poolTimeRange}
        selectedTopicIds={state.selectedTopicIds}
        moreFilters={state.moreFilters}
        sortBy={state.sortBy}
        setIsCreateModalOpen={state.setIsCreateModalOpen}
        beginPoolQueryChange={state.beginPoolQueryChange}
        setPoolPage={state.setPoolPage}
        setPoolView={state.setPoolView}
        setPoolTimeRange={state.setPoolTimeRange}
        setSelectedTopicIds={state.setSelectedTopicIds}
        setMoreFilters={state.setMoreFilters}
        setIsMoreFiltersOpen={state.setIsMoreFiltersOpen}
        setSortBy={state.setSortBy}
        debouncedPoolSearchQuery={state.debouncedPoolSearchQuery}
        setPoolSearchQuery={state.setPoolSearchQuery}
        refreshAll={refreshAll}
        handleGoToFeishu={handleGoToFeishu}
        setInspectTopicId={state.setInspectTopicId}
      />

      <TopicHubDrawers
        inspectTopicId={state.inspectTopicId}
        resolvedPoolItems={state.resolvedPoolItems}
        poolItemCount={state.poolItems.length}
        writingTopicIds={state.writingTopicIds}
        hasPrevTopic={hasPrevTopic}
        hasNextTopic={hasNextTopic}
        handleNavigateTopic={handleNavigateTopic}
        currentInspectIndex={currentInspectIndex}
        poolPage={state.poolPage}
        poolTotalCount={state.poolTotalCount}
        setInspectTopicId={state.setInspectTopicId}
        setPoolItems={state.setPoolItems}
        setPoolTotalCount={state.setPoolTotalCount}
        handleGoToFeishu={handleGoToFeishu}
        currentUserId={state.currentUserId}
        canManageTopicLibrary={canManageTopicLibrary}
        isMoreFiltersOpen={state.isMoreFiltersOpen}
        moreFilters={state.moreFilters}
        beginPoolQueryChange={state.beginPoolQueryChange}
        setPoolPage={state.setPoolPage}
        setMoreFilters={state.setMoreFilters}
        setIsMoreFiltersOpen={state.setIsMoreFiltersOpen}
        isCreateModalOpen={state.isCreateModalOpen}
        setIsCreateModalOpen={state.setIsCreateModalOpen}
        topicsOptions={state.topicsOptions}
        topicsOptionsError={state.topicsOptionsError}
        handleParseImportFile={handleParseImportFile}
        handleConfirmImport={handleConfirmImport}
        refreshAll={refreshAll}
        showToast={showToast}
      />
    </AppShell>
  );
}
