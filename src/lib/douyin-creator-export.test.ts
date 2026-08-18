import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import ExcelJS from "exceljs";

import {
  normalizeCreatorName,
  parseArgs,
  parseVideoCard,
  resolveOutputFilePath,
  writeDouyinExcel,
} from "../../tools/douyin-creator-export/core";

test("douyin export helpers parse arguments and clean creator names", () => {
  const args = parseArgs(["--url=https://www.douyin.com/user/abc", "--output", "out.xlsx", "--flag"]);

  assert.equal(args.get("url"), "https://www.douyin.com/user/abc");
  assert.equal(args.get("output"), "out.xlsx");
  assert.equal(args.get("flag"), "");
  assert.equal(normalizeCreatorName("  小鳄鱼之道的主页 - 抖音  "), "小鳄鱼之道");
});

test("parseVideoCard keeps the card text口径 and extracts video metadata", () => {
  const row = parseVideoCard({
    index: 1,
    creatorName: "小鳄鱼之道",
    creatorHomeUrl: "https://www.douyin.com/user/MS4w...",
    href: "https://www.douyin.com/video/7674175356806495473?previous=1",
    text: "1.2万 均线买点 #股票 #股民",
  });

  assert.ok(row);
  assert.equal(row?.序号, 1);
  assert.equal(row?.达人, "小鳄鱼之道");
  assert.equal(row?.视频ID, "7674175356806495473");
  assert.equal(row?.标题, "均线买点 #股票 #股民");
  assert.equal(row?.点赞数, "1.2万");
  assert.equal(row?.话题标签, "#股票 #股民");
  assert.equal(row?.视频链接, "https://www.douyin.com/video/7674175356806495473");
  assert.equal(row?.原始文本, "1.2万 均线买点 #股票 #股民");
});

test("resolveOutputFilePath uses the expected Douyin filename", () => {
  const output = resolveOutputFilePath({
    creatorName: "小鳄鱼之道",
    count: 60,
    output: "/tmp/douyin-export",
  });

  assert.equal(output, "/tmp/douyin-export/小鳄鱼之道-抖音作品数据-60条.xlsx");
});

test("writeDouyinExcel writes the expected sheets and rows", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "douyin-export-"));
  const file = path.join(dir, "作品.xlsx");
  const rows = [
    {
      序号: 1,
      达人: "小鳄鱼之道",
      视频ID: "7674175356806495473",
      标题: "均线买点 #股票 #股民",
      点赞数: "1.2万",
      话题标签: "#股票 #股民",
      视频链接: "https://www.douyin.com/video/7674175356806495473",
      达人主页: "https://www.douyin.com/user/MS4w...",
      原始文本: "1.2万 均线买点 #股票 #股民",
    },
  ];

  await writeDouyinExcel(rows, file);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);

  assert.deepEqual(workbook.worksheets.map((worksheet) => worksheet.name), ["视频数据", "说明"]);
  const sheet = workbook.getWorksheet("视频数据");
  assert.ok(sheet);
  assert.equal(sheet.getRow(2).getCell(2).value, "小鳄鱼之道");
  assert.equal(sheet.getRow(2).getCell(4).value, "均线买点 #股票 #股民");
  assert.equal(sheet.getRow(2).getCell(9).value, "1.2万 均线买点 #股票 #股民");
});
