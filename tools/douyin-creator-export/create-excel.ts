import fs from "node:fs";

import { parseArgs, type DouyinVideoRow, writeDouyinExcel } from "./core";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = args.get("input");
  const output = args.get("output") ?? "output/douyin-exports/抖音作品数据.xlsx";

  if (!input) {
    throw new Error("缺少 --input。用法：npm run douyin:excel -- --input=data.json --output=output.xlsx");
  }

  const rows = JSON.parse(fs.readFileSync(input, "utf8")) as DouyinVideoRow[];
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("输入 JSON 必须是非空数组");
  }

  const resolvedOutput = await writeDouyinExcel(rows, output);
  console.log(`已生成：${resolvedOutput}`);
  console.log(`视频数：${rows.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
