import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";

import { parseViolationImportWorkbook } from "./import";

function createWorkbookBuffer(rows: Array<Array<string>>) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "导入模板");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

test("违规导入模板会按列映射并补默认平台", () => {
  const buffer = createWorkbookBuffer([
    ["话术原文", "违规/可用", "账号名", "处罚类型", "平台", "备注"],
    ["关注主页领取资料", "违规", "账号甲", "警告", "", "第一条"],
    ["产品卖点口播", "可用", "", "", "抖音,视频号,抖音", ""],
  ]);

  const result = parseViolationImportWorkbook(buffer, {
    submittedBy: "user-1",
    teamId: "team-1",
  });

  assert.equal(result.skipped, 0);
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.rows, [
    {
      submitted_by: "user-1",
      team_id: "team-1",
      script_text: "关注主页领取资料",
      is_violation: true,
      account_name_snapshot: "账号甲",
      result: "警告",
      platforms: ["抖音"],
      scene_description: "第一条",
      status: "submitted",
      purpose: "violation",
      category: "短视频",
    },
    {
      submitted_by: "user-1",
      team_id: "team-1",
      script_text: "产品卖点口播",
      is_violation: false,
      account_name_snapshot: null,
      result: null,
      platforms: ["抖音", "视频号"],
      scene_description: null,
      status: "submitted",
      purpose: "conversion",
      category: "短视频",
    },
  ]);
});

test("违规导入模板会跳过缺少必填列的行并返回错误行号", () => {
  const buffer = createWorkbookBuffer([
    ["话术原文", "违规/可用", "账号名", "处罚类型", "平台", "备注"],
    ["", "违规", "", "", "", ""],
    ["正常脚本", "", "", "", "", ""],
    ["通过脚本", "可用", "", "", "未知平台", ""],
  ]);

  const result = parseViolationImportWorkbook(buffer, {
    submittedBy: "user-1",
    teamId: null,
  });

  assert.equal(result.skipped, 2);
  assert.deepEqual(result.errors, [
    { row: 2, reason: "话术原文不能为空" },
    { row: 3, reason: "违规/可用 不能为空" },
  ]);
  assert.deepEqual(result.rows, [
    {
      submitted_by: "user-1",
      team_id: null,
      script_text: "通过脚本",
      is_violation: false,
      account_name_snapshot: null,
      result: null,
      platforms: ["抖音"],
      scene_description: null,
      status: "submitted",
      purpose: "conversion",
      category: "短视频",
    },
  ]);
});
