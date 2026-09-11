import assert from "node:assert/strict";
import test from "node:test";

import { buildComparisonMemberOptions } from "./content-comparison-members";

test("指定成员候选会合并 profiles、视频作者和兜底成员并按 id 去重", () => {
  const members = buildComparisonMemberOptions({
    profiles: [{ id: "author-1", name: "作者本人" }],
    videos: [
      { user_id: "author-1", profiles: { name: "作者视频名" } },
      { user_id: "member-2", profiles: { name: "视频里的成员" } },
      { user_id: "member-3", profiles: [{ name: "数组关联成员" }] },
    ],
    fallbackProfiles: [
      { id: "member-2", name: "兜底重复成员" },
      { id: "member-4", name: "兜底成员" },
    ],
  });

  assert.deepEqual(members, [
    { id: "author-1", name: "作者本人" },
    { id: "member-2", name: "视频里的成员" },
    { id: "member-3", name: "数组关联成员" },
    { id: "member-4", name: "兜底成员" },
  ]);
});

test("指定成员候选过滤空 id，并给无名成员稳定兜底名称", () => {
  const members = buildComparisonMemberOptions({
    profiles: [
      { id: "", name: "空" },
      { id: "member-1", name: "" },
    ],
    videos: [
      { user_id: null, profiles: { name: "无 id" } },
      { user_id: "member-2", profiles: null },
    ],
  });

  assert.deepEqual(members, [
    { id: "member-1", name: "未命名成员" },
    { id: "member-2", name: "未命名成员" },
  ]);
});
