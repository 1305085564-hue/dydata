import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

import {
  MAX_VIOLATION_IMPORT_FILE_SIZE,
  parseViolationImportWorkbook,
  validateViolationImportFile,
} from "./import";

async function createWorkbookBuffer(rows: Array<Array<string>>) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("导入模板");
  sheet.addRows(rows);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test("违规导入模板会按列映射并补默认平台", async () => {
  const buffer = await createWorkbookBuffer([
    ["话术原文", "违规/可用", "账号名", "处罚类型", "平台", "备注"],
    ["关注主页领取资料", "违规", "账号甲", "警告", "", "第一条"],
    ["产品卖点口播", "可用", "", "", "抖音,视频号,抖音", ""],
  ]);

  const result = await parseViolationImportWorkbook(buffer, {
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

test("违规导入模板会跳过缺少必填列的行并返回错误行号", async () => {
  const buffer = await createWorkbookBuffer([
    ["话术原文", "违规/可用", "账号名", "处罚类型", "平台", "备注"],
    ["", "违规", "", "", "", ""],
    ["正常脚本", "", "", "", "", ""],
    ["通过脚本", "可用", "", "", "未知平台", ""],
  ]);

  const result = await parseViolationImportWorkbook(buffer, {
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

test("富文本和公式单元格使用可见文本与公式结果", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("导入模板");
  sheet.addRow(["话术原文", "违规/可用", "账号名", "处罚类型", "平台", "备注"]);
  sheet.getCell("A2").value = { richText: [{ text: "关注" }, { text: "主页" }] };
  sheet.getCell("B2").value = { formula: 'IF(1=1,"违规","可用")', result: "违规" };
  sheet.getCell("E2").value = "抖音";

  const result = await parseViolationImportWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()), {
    submittedBy: "user-1",
    teamId: null,
  });
  assert.equal(result.rows[0]?.script_text, "关注主页");
  assert.equal(result.rows[0]?.is_violation, true);
});

test("导入文件必须同时满足扩展名、MIME 和 2MB 限制", () => {
  const valid = {
    name: "cases.xlsx",
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: 1024,
  };
  assert.equal(validateViolationImportFile(valid), null);
  assert.match(validateViolationImportFile({ ...valid, name: "cases.csv" }) ?? "", /\.xlsx/);
  assert.match(validateViolationImportFile({ ...valid, type: "application/octet-stream" }) ?? "", /MIME/);
  assert.match(validateViolationImportFile({ ...valid, size: MAX_VIOLATION_IMPORT_FILE_SIZE + 1 }) ?? "", /2MB/);
});

test("导入工作簿超过 5000 行数据时拒绝", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("导入模板");
  sheet.getCell("A1").value = "话术原文";
  sheet.getCell("A5002").value = "越界数据";
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

  await assert.rejects(
    parseViolationImportWorkbook(buffer, { submittedBy: "user-1", teamId: null }),
    /最多支持 5000 行/,
  );
});
