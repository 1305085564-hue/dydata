import test from "node:test";
import assert from "node:assert/strict";

import { diagnoseIssue } from "./diagnosis";

test("症状按代码、数据、任务和用户问题分类", async () => {
  assert.equal((await diagnoseIssue({ symptom: "接口报错 500" })).data?.issueType, "code_bug");
  assert.equal((await diagnoseIssue({ symptom: "数据不对" })).data?.issueType, "data_corruption");
  assert.equal((await diagnoseIssue({ symptom: "任务卡住" })).data?.issueType, "task_stuck");
  assert.equal((await diagnoseIssue({ symptom: "不知道怎么操作" })).data?.issueType, "user_error");
});

test("空值返回错误，未知症状返回引导", async () => {
  assert.deepEqual(await diagnoseIssue({ symptom: null }), { success: false, error: "缺少 symptom" });
  assert.equal((await diagnoseIssue({ symptom: "其他" })).data?.issueType, "unknown");
});
