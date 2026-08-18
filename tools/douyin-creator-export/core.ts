import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";

export interface DouyinVideoRow {
  序号?: number | string;
  达人?: string;
  达人主页?: string;
  视频ID: string;
  标题: string;
  点赞数?: string;
  话题标签?: string;
  视频链接: string;
  原始文本?: string;
}

export interface DouyinCardInput {
  index: number;
  creatorName: string;
  creatorHomeUrl: string;
  href: string;
  text?: string;
  titleText?: string;
  altText?: string;
}

const INVALID_FILE_NAME = /[\\/:*?"<>|]/g;
const LIKE_PREFIX = /^([0-9][0-9.,]*(?:\.\d+)?(?:万|w)?)(?:\s+(.+))$/iu;

export function parseArgs(argv: string[]) {
  const args = new Map<string, string>();

  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;

    const [key, inlineValue] = item.slice(2).split("=", 2);
    if (inlineValue != null) {
      args.set(key, inlineValue);
      continue;
    }

    const next = argv[i + 1];
    if (next != null && !next.startsWith("--")) {
      args.set(key, next);
      i += 1;
      continue;
    }

    args.set(key, "");
  }

  return args;
}

export function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function sanitizeFileName(value: string) {
  return normalizeText(value).replace(INVALID_FILE_NAME, "-");
}

export function normalizeCreatorName(value: string) {
  let current = normalizeText(value);
  const suffixPatterns = [
    /(?:\s*[-—–_·|]\s*)?抖音号.*$/u,
    /(?:\s*[-—–_·|]\s*)?抖音$/u,
    /(?:\s*[-—–_·|]\s*)?的主页$/u,
    /(?:\s*[-—–_·|]\s*)?主页$/u,
  ];

  let previous = "";
  while (current && current !== previous) {
    previous = current;
    for (const pattern of suffixPatterns) {
      current = current.replace(pattern, "").trim();
    }
  }

  return current || normalizeText(value);
}

export function buildVideoExportFileName(creatorName: string, count: number) {
  const safeName = sanitizeFileName(creatorName || "抖音达人");
  return `${safeName}-抖音作品数据-${count}条.xlsx`;
}

export function resolveOutputFilePath({
  output,
  creatorName,
  count,
  defaultDir = "output/douyin-exports",
}: {
  output?: string;
  creatorName: string;
  count: number;
  defaultDir?: string;
}) {
  const fileName = buildVideoExportFileName(creatorName, count);
  if (!output) {
    return path.resolve(defaultDir, fileName);
  }

  const resolved = path.resolve(output);
  if (path.extname(resolved).toLowerCase() === ".xlsx") {
    return resolved;
  }

  return path.join(resolved, fileName);
}

export function parseVideoCard(input: DouyinCardInput): DouyinVideoRow | null {
  const rawText = normalizeText(input.text ?? input.titleText ?? input.altText ?? "");
  const videoId = input.href.match(/\/video\/(\d+)/)?.[1];
  if (!videoId) return null;

  const likeMatch = rawText.match(LIKE_PREFIX);
  const likes = likeMatch?.[1];
  const title = likeMatch?.[2] ?? rawText;
  const tags = title.match(/#[^\s#]+/g)?.join(" ");

  return {
    序号: input.index,
    达人: normalizeCreatorName(input.creatorName),
    达人主页: input.creatorHomeUrl,
    视频ID: videoId,
    标题: title,
    点赞数: likes || undefined,
    话题标签: tags || undefined,
    视频链接: `https://www.douyin.com/video/${videoId}`,
    原始文本: rawText,
  };
}

export function normalizeVideoRows(rows: DouyinVideoRow[]) {
  const seen = new Set<string>();
  const normalized: DouyinVideoRow[] = [];

  for (const row of rows) {
    if (seen.has(row.视频ID)) continue;
    seen.add(row.视频ID);
    normalized.push({ ...row, 序号: normalized.length + 1 });
  }

  return normalized;
}

export async function writeDouyinExcel(rows: DouyinVideoRow[], output: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Codex";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("视频数据");
  sheet.columns = [
    { header: "序号", key: "序号", width: 8 },
    { header: "达人", key: "达人", width: 16 },
    { header: "视频ID", key: "视频ID", width: 24 },
    { header: "标题", key: "标题", width: 42 },
    { header: "点赞数", key: "点赞数", width: 12 },
    { header: "话题标签", key: "话题标签", width: 28 },
    { header: "视频链接", key: "视频链接", width: 54 },
    { header: "达人主页", key: "达人主页", width: 70 },
    { header: "原始文本", key: "原始文本", width: 48 },
  ];

  sheet.addRows(
    rows.map((row, index) => ({
      ...row,
      序号: row.序号 ?? index + 1,
    })),
  );
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "I1" };

  for (const row of sheet.getRows(2, rows.length) ?? []) {
    row.alignment = { vertical: "top", wrapText: true };
  }

  const note = workbook.addWorksheet("说明");
  note.addRows([
    ["字段", "值"],
    ["生成时间", new Date().toISOString()],
    ["视频数", rows.length],
    ["说明", "该表由隔离工具生成；数据来源为已经采集/提取出的抖音作品卡片 JSON。"],
  ]);
  note.columns = [{ width: 18 }, { width: 100 }];
  note.getRow(1).font = { bold: true };

  const resolvedOutput = path.resolve(output);
  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  await workbook.xlsx.writeFile(resolvedOutput);
  return resolvedOutput;
}

export async function readWorkbookVideoRowCount(filePath: string) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheet = workbook.getWorksheet("视频数据");
  if (!sheet) {
    throw new Error("未找到名为「视频数据」的工作表");
  }

  return Math.max(sheet.rowCount - 1, 0);
}
