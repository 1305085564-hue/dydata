import assert from "node:assert/strict";
import test from "node:test";
import type { AvailabilityModelFamily, BusinessAssuranceItem } from "./availability";
import {
  applyFrozenOrder, compareChannelModels, compareChannels, compareModelFamilies,
  compareSelectableModels, sortSyncGroups,
} from "./list-order";

const family = (modelId: string, patch: Partial<AvailabilityModelFamily> = {}) =>
  ({ modelId, displayName: modelId, isSelectable: false, isConfigured: false, ...patch }) as AvailabilityModelFamily;

test("模型卡：有业务在用 → 能用 → 暂时不可用 → 已停用，同档按名字", () => {
  const families = [
    family("z-stopped"),
    family("b-broken", { isConfigured: true }),
    family("y-usable", { isSelectable: true, isConfigured: true }),
    family("a-stopped"),
    family("x-in-use", { isSelectable: true, isConfigured: true }),
    family("c-usable", { isSelectable: true, isConfigured: true }),
  ];
  const assurances = [{ resolvedModelId: "x-in-use" }, { resolvedModelId: null }] as BusinessAssuranceItem[];
  assert.deepEqual(
    [...families].sort(compareModelFamilies(assurances)).map((item) => item.modelId),
    ["x-in-use", "c-usable", "y-usable", "b-broken", "a-stopped", "z-stopped"],
  );
});

test("同档名字按自然顺序排：4.6 在 4.10 前面", () => {
  const families = [family("m10", { displayName: "Claude 4.10" }), family("m6", { displayName: "Claude 4.6" })];
  assert.deepEqual([...families].sort(compareModelFamilies([])).map((item) => item.modelId), ["m6", "m10"]);
});

test("渠道、供应模型、下拉框：开着/能选的在上", () => {
  assert.deepEqual(
    [{ id: "1", label: "b", is_enabled: false }, { id: "2", label: "c", is_enabled: true }, { id: "3", label: "a", is_enabled: true }]
      .sort(compareChannels).map((item) => item.id),
    ["3", "2", "1"],
  );
  assert.deepEqual(
    [{ id: "1", model_id: "a", is_enabled: false }, { id: "2", model_id: "b", display_name: "B", is_enabled: true }]
      .sort(compareChannelModels).map((item) => item.id),
    ["2", "1"],
  );
  assert.deepEqual(
    [{ id: "a", displayName: "A", isSelectable: false }, { id: "b", displayName: "B", isSelectable: true }]
      .sort(compareSelectableModels).map((item) => item.id),
    ["b", "a"],
  );
});

test("同步弹窗：本渠道在用的组在上，任一版本在用即算", () => {
  const groups = [
    { displayName: "A", modelIds: ["a"] },
    { displayName: "C", modelIds: ["c", "c-thinking"] },
    { displayName: "B", modelIds: ["b"] },
  ];
  assert.deepEqual(sortSyncGroups(groups, new Set(["c-thinking", "b"])).map((item) => item.displayName), ["B", "C", "A"]);
});

test("定格顺序：已在快照里的保持原位，新出现的排在末尾", () => {
  const compare = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
  const items = [{ id: "c" }, { id: "new-b" }, { id: "a" }, { id: "new-a" }];
  assert.deepEqual(applyFrozenOrder(items, ["c", "gone", "a"], (item) => item.id, compare).map((item) => item.id), ["c", "a", "new-a", "new-b"]);
});
