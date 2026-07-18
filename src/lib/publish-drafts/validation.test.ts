import test from "node:test";
import assert from "node:assert/strict";

import { validateCreateDraftPayload, validateRejectPayload, validateUpdateDraftPayload } from "./validation";

test("新建稿件会清理正文、截图和空账号", () => {
  assert.deepEqual(validateCreateDraftPayload({ script_text: " 正文 ", screenshot_paths: [" a.png ", "a.png"], account_id: " " }), {
    ok: true,
    data: { script_text: "正文", screenshot_paths: ["a.png"], account_id: null },
  });
});

test("空数组允许，null 请求体和超长正文返回错误", () => {
  assert.equal(validateCreateDraftPayload({ script_text: "正文", screenshot_paths: [] }).ok, true);
  assert.deepEqual(validateCreateDraftPayload(null), { ok: false, message: "请求体格式不正确" });
  assert.equal(validateCreateDraftPayload({ script_text: "x".repeat(5001), screenshot_paths: [] }).ok, false);
});

test("更新至少需要一个字段，驳回理由不能为空", () => {
  assert.deepEqual(validateUpdateDraftPayload({}), { ok: false, message: "至少提交一个可更新字段" });
  assert.deepEqual(validateUpdateDraftPayload({ account_id: null }), { ok: true, data: { account_id: null } });
  assert.equal(validateRejectPayload({ feedback_text: " " }).ok, false);
  assert.deepEqual(validateRejectPayload({ feedback_text: " 修改开头 " }), { ok: true, data: { feedback_text: "修改开头" } });
});
