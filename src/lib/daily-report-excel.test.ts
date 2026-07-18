import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";

import { buildDailyReportWorkbookBuffer, type DailyReportExcelRow } from "./daily-report-excel";

test("日报导出工作簿可由 ExcelJS 往返读取且公式样文本保持纯文本", async () => {
  const row: DailyReportExcelRow = {
    日期: "2026-07-18",
    提交人: "小陈",
    视频标题: "=HYPERLINK(\"https://evil.test\")",
    "播放量(万)": "1.23",
    完播率: "25%",
    平均播放时长: "12秒",
    "2s跳出率": "10%",
    "5s完播率": "40%",
    涨粉: 5,
    导粉: 2,
    点赞: 100,
    评论: 8,
    分享: 3,
    收藏: 6,
    文案内容: "测试内容",
    发布时间: "2026-07-18 09:00",
    上传时间: "2026-07-18 10:00",
  };

  const buffer = await buildDailyReportWorkbookBuffer([row]);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.getWorksheet("数据日报");

  assert.ok(worksheet);
  assert.equal(worksheet.getCell("A2").value, "2026-07-18");
  assert.equal(worksheet.getCell("C2").value, "=HYPERLINK(\"https://evil.test\")");
  assert.equal(worksheet.getCell("I2").value, 5);
});
