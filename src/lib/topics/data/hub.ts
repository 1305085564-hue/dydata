import { useCallback, useEffect } from "react";
import type {
  BatchImportParsedRow,
  BatchImportSummary,
} from "@/components/topics-v2/types";
import {
  fetchTopicJson,
  parseActiveTopicsResponse,
  parseTopicLibraryBootstrapResponse,
  parseTopicPoolResponse,
  isTeamMembershipRequiredError,
  TopicRequestError,
  type V2TopicLibraryBootstrap,
} from "@/lib/topics/v2-client-contract";
import { buildTopicPoolQuery } from "@/components/topics-v2/topic-navigation";
import type { useTopicHubState } from "../domain/hub-state";

type TopicHubState = ReturnType<typeof useTopicHubState>;

type TopicHubDataOptions = {
  initialBootstrapData: V2TopicLibraryBootstrap | null;
  setActiveTopics: TopicHubState["setActiveTopics"];
  setActiveLoading: TopicHubState["setActiveLoading"];
  setActiveError: TopicHubState["setActiveError"];
  setPoolItems: TopicHubState["setPoolItems"];
  setPoolLoading: TopicHubState["setPoolLoading"];
  setPoolError: TopicHubState["setPoolError"];
  setPoolTotalCount: TopicHubState["setPoolTotalCount"];
  setTopicsOptions: TopicHubState["setTopicsOptions"];
  setTopicsOptionsError: TopicHubState["setTopicsOptionsError"];
  setCurrentUserId: TopicHubState["setCurrentUserId"];
  setAuthError: TopicHubState["setAuthError"];
  setMembershipRequired: TopicHubState["setMembershipRequired"];
  poolRequestId: TopicHubState["poolRequestId"];
  poolAbortController: TopicHubState["poolAbortController"];
  poolView: TopicHubState["poolView"];
  sortBy: TopicHubState["sortBy"];
  debouncedPoolSearchQuery: TopicHubState["debouncedPoolSearchQuery"];
  poolTimeRange: TopicHubState["poolTimeRange"];
  selectedTopicIds: TopicHubState["selectedTopicIds"];
  moreFilters: TopicHubState["moreFilters"];
  poolPage: TopicHubState["poolPage"];
  poolQueryKey: TopicHubState["poolQueryKey"];
  skipPoolEffectPage: TopicHubState["skipPoolEffectPage"];
  previousPoolQueryKey: TopicHubState["previousPoolQueryKey"];
  setWritingTopicIds: TopicHubState["setWritingTopicIds"];
  bootstrapRequestRef: TopicHubState["bootstrapRequestRef"];
};

export function useTopicHubData({
  initialBootstrapData,
  setActiveTopics,
  setActiveLoading,
  setActiveError,
  setPoolItems,
  setPoolLoading,
  setPoolError,
  setPoolTotalCount,
  setTopicsOptions,
  setTopicsOptionsError,
  setCurrentUserId,
  setAuthError,
  setMembershipRequired,
  poolRequestId,
  poolAbortController,
  poolView,
  sortBy,
  debouncedPoolSearchQuery,
  poolTimeRange,
  selectedTopicIds,
  moreFilters,
  poolPage,
  poolQueryKey,
  skipPoolEffectPage,
  previousPoolQueryKey,
  setWritingTopicIds,
  bootstrapRequestRef,
}: TopicHubDataOptions) {

  // 首屏聚合读取：服务端一次确认身份并并行返回首屏所需数据。
  const fetchBootstrapData = useCallback(() => {
    if (bootstrapRequestRef.current) return bootstrapRequestRef.current;

    const request = (async () => {
      setActiveLoading(true);
      setPoolLoading(true);
      setActiveError(null);
      setPoolError(null);
      setTopicsOptionsError(null);

      try {
        const parsed = parseTopicLibraryBootstrapResponse(
          await fetchTopicJson("/api/topics/bootstrap"),
        );
        setActiveTopics(parsed.active);
        setTopicsOptions(parsed.options);
        setPoolItems(parsed.pool.items);
        setPoolTotalCount(parsed.pool.pagination.totalItems);
        setWritingTopicIds(new Set(parsed.myWritingTopicIds));
        setCurrentUserId(parsed.currentUserId);
        setAuthError(false);
      } catch (err) {
        if (isTeamMembershipRequiredError(err)) {
          setMembershipRequired(true);
        }
        if (err instanceof TopicRequestError && err.status === 401) {
          setAuthError(true);
        }
        const message = getErrorMessage(err, "加载选题库失败");
        setActiveError(message);
        setPoolError(message);
        setTopicsOptionsError(message);
      } finally {
        setActiveLoading(false);
        setPoolLoading(false);
      }
    })();

    bootstrapRequestRef.current = request;
    void request.then(
      () => {
        if (bootstrapRequestRef.current === request) bootstrapRequestRef.current = null;
      },
      () => {
        if (bootstrapRequestRef.current === request) bootstrapRequestRef.current = null;
      },
    );
    return request;
  }, [
    bootstrapRequestRef,
    setActiveError,
    setActiveLoading,
    setActiveTopics,
    setAuthError,
    setCurrentUserId,
    setMembershipRequired,
    setPoolError,
    setPoolItems,
    setPoolLoading,
    setPoolTotalCount,
    setTopicsOptions,
    setTopicsOptionsError,
    setWritingTopicIds,
  ]);

  // 筛选/刷新后的大盘活跃数据
  const fetchActiveData = useCallback(async () => {
    setActiveLoading(true);
    setActiveError(null);
    try {
      const data = await fetchTopicJson("/api/topics/active");
      const parsed = parseActiveTopicsResponse(data);
      setActiveTopics(parsed);
      setAuthError(false);
    } catch (err) {
      if (isTeamMembershipRequiredError(err)) {
        setMembershipRequired(true);
        return;
      }
      if (err instanceof TopicRequestError && err.status === 401) {
        setAuthError(true);
      }
      setActiveError(getErrorMessage(err, "加载活跃母题失败"));
    } finally {
      setActiveLoading(false);
    }
  }, [
    setActiveError,
    setActiveLoading,
    setActiveTopics,
    setAuthError,
    setMembershipRequired,
  ]);

  // 获取筛选后的选题池列表；首次进入由 bootstrap 提供，避免重复请求。
  const fetchPoolPage = useCallback(async (targetPage: number) => {
    const requestId = ++poolRequestId.current;
    poolAbortController.current?.abort();
    const controller = new AbortController();
    poolAbortController.current = controller;
    setPoolLoading(true);
    setPoolError(null);

    const params = buildTopicPoolQuery({
      view: poolView,
      sort: sortBy,
      search: debouncedPoolSearchQuery,
      timeRange: poolTimeRange,
      topicIds: selectedTopicIds,
      sourceType: moreFilters.sourceType,
      recentHeat: moreFilters.recentHeat,
      durationRange: moreFilters.durationRange,
      performance: moreFilters.performanceTier,
      pageSize: 50,
    }, targetPage);

    try {
      const data = await fetchTopicJson(`/api/topics/pool?${params.toString()}`, {
        signal: controller.signal,
      });
      if (controller.signal.aborted || requestId !== poolRequestId.current) return null;
      const parsed = parseTopicPoolResponse(data);
      setPoolItems(parsed.items);
      setPoolTotalCount(parsed.pagination.totalItems);
      return parsed;
    } catch (err) {
      if (controller.signal.aborted || requestId !== poolRequestId.current) return null;
      if (isTeamMembershipRequiredError(err)) {
        setMembershipRequired(true);
        return null;
      }
      setPoolError(getErrorMessage(err, "加载选题池失败"));
      return null;
    } finally {
      if (requestId === poolRequestId.current) {
        setPoolLoading(false);
      }
    }
  }, [
    debouncedPoolSearchQuery,
    moreFilters,
    poolAbortController,
    poolRequestId,
    poolView,
    poolTimeRange,
    setMembershipRequired,
    setPoolError,
    setPoolItems,
    setPoolLoading,
    setPoolTotalCount,
    sortBy,
    selectedTopicIds,
  ]);

  const fetchPoolData = useCallback(
    () => fetchPoolPage(poolPage),
    [fetchPoolPage, poolPage],
  );

  // 初始化只走 bootstrap；筛选条件真正变化后才请求普通 pool 接口。
  useEffect(() => {
    if (initialBootstrapData) return;
    void fetchBootstrapData();
  }, [fetchBootstrapData, initialBootstrapData]);

  useEffect(() => {
    if (skipPoolEffectPage.current === poolPage) {
      skipPoolEffectPage.current = null;
      previousPoolQueryKey.current = poolQueryKey;
      return;
    }
    if (previousPoolQueryKey.current === null) {
      previousPoolQueryKey.current = poolQueryKey;
      return;
    }
    if (previousPoolQueryKey.current === poolQueryKey) return;
    previousPoolQueryKey.current = poolQueryKey;
    void fetchPoolData();
  }, [
    fetchPoolData,
    poolPage,
    poolQueryKey,
    previousPoolQueryKey,
    skipPoolEffectPage,
  ]);

  // 刷新会变化的动态与选题列表；母题选项只在首屏读取，写入动作不会改变它。
  const refreshAll = useCallback(async () => {
    await Promise.all([
      fetchActiveData(),
      fetchPoolData(),
    ]);
  }, [fetchActiveData, fetchPoolData]);

  // 管理员通道：外部干货批量导入（真实解析与导入接口）
  const handleParseImportFile = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/admin/topics-library/import/parse", {
      method: "POST",
      body: formData,
    });
    const payload = (await res.json().catch(() => null)) as
      | { error?: string; rows?: unknown; summary?: unknown }
      | null;
    if (!res.ok || !payload) {
      throw new Error(payload?.error || "文件解析失败，请稍后重试");
    }
    const rows = (payload.rows ?? []) as Array<Record<string, unknown>>;
    const parsedRows: BatchImportParsedRow[] = rows.map((row) => ({
      rowNumber: Number(row.rowNumber ?? 0),
      topicName: String(row.topicName ?? ""),
      title: String(row.title ?? ""),
      durationText: typeof row.durationText === "string" ? row.durationText : undefined,
      historyPlay: (row.historyPlay as number | null) ?? null,
      historyLikes: (row.historyLikes as number | null) ?? null,
      hook: (row.hook as string | null) ?? null,
      outline: (row.outline as string | null) ?? null,
      status: (row.status as BatchImportParsedRow["status"]) ?? "error",
      validationMessage: String(row.message ?? row.validationMessage ?? ""),
    }));

    // summary 窄化校验：后端返回合法数值计数则采用，缺失/非法时从已解析行按状态兜底派生，
    // 避免把脏结构或缺失字段盲转成 BatchImportSummary。
    const rawSummary = payload.summary as Partial<BatchImportSummary> | null | undefined;
    const safeCount = (value: unknown, fallback: number) =>
      typeof value === "number" && Number.isFinite(value) ? value : fallback;
    const summary: BatchImportSummary = {
      totalCount: safeCount(rawSummary?.totalCount, parsedRows.length),
      validCount: safeCount(
        rawSummary?.validCount,
        parsedRows.filter((r) => r.status === "valid").length,
      ),
      warningCount: safeCount(
        rawSummary?.warningCount,
        parsedRows.filter((r) => r.status === "warning").length,
      ),
      errorCount: safeCount(
        rawSummary?.errorCount,
        parsedRows.filter((r) => r.status === "error").length,
      ),
      errors:
        rawSummary && Array.isArray(rawSummary.errors) ? rawSummary.errors : [],
    };

    return { rows: parsedRows, summary };
  }, []);

  const handleConfirmImport = useCallback(async (
    rows: BatchImportParsedRow[],
    fileName?: string | null,
  ) => {
    const res = await fetch("/api/admin/topics-library/import/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows, fileName: fileName ?? null }),
    });
    const payload = (await res.json().catch(() => null)) as
      | { error?: string; successCount?: number; skippedCount?: number; failedCount?: number; errors?: Array<{ rowNumber: number; title: string; reason: string }> }
      | null;
    if (!res.ok || !payload) {
      throw new Error(payload?.error || "导入执行失败，请稍后重试");
    }
    if ((payload.successCount ?? 0) > 0) {
      await refreshAll();
    }
    return {
      successCount: payload.successCount ?? 0,
      skippedCount: payload.skippedCount ?? 0,
      failedCount: payload.failedCount ?? 0,
      errors: payload.errors ?? [],
    };
  }, [refreshAll]);

  return {
    fetchActiveData,
    fetchPoolPage,
    refreshAll,
    handleParseImportFile,
    handleConfirmImport,
  };
}

export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof TopicRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}
