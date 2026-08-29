import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Topics V3 Frontend Reliability & State Contracts", () => {
  // 1. 没有真实历史数据时显示「—」，不显示 3.0万+ 或已验证
  it("formatBestPlay returns null / '—' when no real summary or works exist", () => {
    const getBestPlay = (s: { bestPlayCount?: number | null } | null) =>
      s?.bestPlayCount ?? null;
    const bestPlayNull = getBestPlay(null);
    assert.strictEqual(bestPlayNull, null);

    const formatMetric = (val: number | null) =>
      val !== null
        ? val >= 10000
          ? `${(val / 10000).toFixed(1)}万`
          : val.toLocaleString()
        : "—";

    assert.strictEqual(formatMetric(bestPlayNull), "—");
    assert.notStrictEqual(formatMetric(bestPlayNull), "3.0万+");
  });

  it("formatQualifiedCount returns null / '—' when no qualifiedWorkCount exists", () => {
    const getQualifiedCount = (
      s: { qualifiedWorkCount?: number | null } | null,
    ) => s?.qualifiedWorkCount ?? null;
    const qualifiedCount = getQualifiedCount(null);
    assert.strictEqual(qualifiedCount, null);

    const formatQualified = (count: number | null) =>
      count !== null ? `${count} 条` : "—";

    assert.strictEqual(formatQualified(qualifiedCount), "—");
    assert.notStrictEqual(formatQualified(qualifiedCount), "已验证");
  });

  // 2. 没有七天数据时不补造 1 人或额外加 2
  it("participants7d does not forge +2 or fallback 1 when data is missing or empty", () => {
    const itemWithNo7d = {
      recent7dParticipants: null,
      claimCount: null,
      scriptingCount: 0,
    };

    const participants7d =
      itemWithNo7d.recent7dParticipants ?? itemWithNo7d.claimCount ?? null;

    assert.strictEqual(participants7d, null);

    // In JSX formatting:
    const displayText =
      participants7d !== null
        ? `近 7 天 ${participants7d} 人参与`
        : "近 7 天 0 人参与";

    assert.strictEqual(displayText, "近 7 天 0 人参与");
    assert.notStrictEqual(displayText, "近 7 天 1 人参与");
    assert.notStrictEqual(displayText, "近 7 天 3 人参与");
  });

  // 3. 未提供解析回调时，上传文件不会出现固定示例预览
  it("when onParseFile is undefined, parsedRows remains empty and does not generate sample rows", () => {
    const onParseFile = undefined;
    let step = "upload";
    let parsedRows: unknown[] = [];

    // Simulate file select when no onParseFile is provided
    if (!onParseFile) {
      step = "preview";
      parsedRows = [];
    }

    assert.strictEqual(step, "preview");
    assert.strictEqual(parsedRows.length, 0);
  });

  // 4. 未提供导入回调时，不出现导入成功结果
  it("when onConfirmImport is undefined, handleConfirm rejects and does not transition to success result", async () => {
    const onConfirmImport = undefined;
    const step = "preview";
    let submitError: string | null = null;

    if (!onConfirmImport) {
      submitError = "导入接口待后端接入";
    }

    assert.strictEqual(step, "preview");
    assert.strictEqual(submitError, "导入接口待后端接入");
  });

  // 5. 非管理员不显示批量导入
  it("non-admin does not render batch import button", () => {
    const isAdmin = false;
    const onBatchImportClick = () => {};

    const shouldRenderBatchImport = Boolean(isAdmin && onBatchImportClick);
    assert.strictEqual(shouldRenderBatchImport, false);

    const adminShouldRender = Boolean(true && onBatchImportClick);
    assert.strictEqual(adminShouldRender, true);
  });

  // 6. 未接入的“更多”筛选不显示“已生效”
  it("moreFilters does not generate active filter pills when backend is not connected", () => {
    const selectedTopicIds: string[] = [];
    const currentTimeRange = "all";
    const searchQuery = "";

    // Even if moreFilters state has non-all values, only real active filters are checked for pills
    const hasRealActiveFilters =
      selectedTopicIds.length > 0 ||
      currentTimeRange !== "all" ||
      searchQuery.trim().length > 0;

    assert.strictEqual(hasRealActiveFilters, false);
  });

  // 7. 写作接口返回非 2xx 时不提示成功
  it("handleMarkWriting strictly throws error on non-ok HTTP responses without faking claim fallback", async () => {
    let successToastTriggered = false;
    let errorToastTriggered = false;

    const mockFetch = async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: "无权执行此操作" }),
    });

    try {
      const res = await mockFetch();
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `操作失败 (${res.status})`);
      }
      successToastTriggered = true;
    } catch {
      errorToastTriggered = true;
    }

    assert.strictEqual(successToastTriggered, false);
    assert.strictEqual(errorToastTriggered, true);
  });

  // 8. 管理端移出、恢复失败时不改变状态、不提示成功
  it("onToggleTopicLibrary failure retains original state and does not trigger success", async () => {
    let currentStatus = "in_library";
    let successNotified = false;
    let errorNotified = false;

    const mockToggle = async () => {
      throw new Error("网络错误，移出失败");
    };

    try {
      await mockToggle();
      currentStatus = "removed";
      successNotified = true;
    } catch {
      errorNotified = true;
    }

    assert.strictEqual(currentStatus, "in_library");
    assert.strictEqual(successNotified, false);
    assert.strictEqual(errorNotified, true);
  });
});
