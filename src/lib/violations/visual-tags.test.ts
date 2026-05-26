import test from "node:test";
import assert from "node:assert/strict";

import {
  buildVisualTagDetail,
  buildVisualTagList,
  validateCaseVisualTagIds,
  validateCreateVisualTagPayload,
} from "./visual-tags";

test("visual tags 创建标签校验 name 和 description", () => {
  assert.deepEqual(validateCreateVisualTagPayload({ name: "  口播场景  ", description: "  第一屏文案  " }), {
    ok: true,
    data: {
      name: "口播场景",
      description: "第一屏文案",
    },
  });

  assert.deepEqual(validateCreateVisualTagPayload({ name: " " }), {
    ok: false,
    message: "name 为必填项",
  });
});

test("visual tags 设置案例标签时去重并校验 UUID", () => {
  const tagId = "11111111-1111-4111-8111-111111111111";
  const secondTagId = "22222222-2222-4222-8222-222222222222";

  assert.deepEqual(validateCaseVisualTagIds({ tag_ids: [tagId, secondTagId, tagId] }), {
    ok: true,
    data: {
      tag_ids: [tagId, secondTagId],
    },
  });

  assert.deepEqual(validateCaseVisualTagIds({ tag_ids: ["bad-id"] }), {
    ok: false,
    message: "tag_ids 包含非法 UUID",
  });
});

test("visual tags 列表会补齐 case_count", () => {
  const result = buildVisualTagList(
    [
      { id: "tag-1", name: "展示素材", description: null },
      { id: "tag-2", name: "口播镜头", description: "镜头前口播" },
    ],
    [
      { tag_id: "tag-1" },
      { tag_id: "tag-1" },
      { tag_id: "tag-2" },
    ],
  );

  assert.deepEqual(result, [
    { id: "tag-1", name: "展示素材", description: null, case_count: 2 },
    { id: "tag-2", name: "口播镜头", description: "镜头前口播", case_count: 1 },
  ]);
});

test("visual tags 详情会聚合 pass/fail 和通过率", () => {
  const result = buildVisualTagDetail(
    { id: "tag-1", name: "展示素材", description: null },
    [
      {
        id: "case-1",
        script_text: "脚本 A",
        account_name_snapshot: "账号 A",
        pass_count: 3,
        fail_count: 1,
        status: "verified",
      },
      {
        id: "case-2",
        script_text: "脚本 B",
        account_name_snapshot: null,
        pass_count: 1,
        fail_count: 1,
        status: "submitted",
      },
    ],
  );

  assert.deepEqual(result, {
    tag: { id: "tag-1", name: "展示素材", description: null },
    stats: {
      totalCases: 2,
      passCount: 4,
      failCount: 2,
      passRate: 67,
    },
    cases: [
      {
        id: "case-1",
        script_text: "脚本 A",
        account_name_snapshot: "账号 A",
        pass_count: 3,
        fail_count: 1,
        status: "verified",
      },
      {
        id: "case-2",
        script_text: "脚本 B",
        account_name_snapshot: null,
        pass_count: 1,
        fail_count: 1,
        status: "submitted",
      },
    ],
  });
});
