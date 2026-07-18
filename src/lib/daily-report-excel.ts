import ExcelJS from "exceljs";

export type DailyReportExcelRow = {
  日期: string | null;
  提交人: string | null;
  视频标题: string | null;
  "播放量(万)": string;
  完播率: string;
  平均播放时长: string;
  "2s跳出率": string;
  "5s完播率": string;
  涨粉: number | null;
  导粉: number | string;
  点赞: number | null;
  评论: number | null;
  分享: number | null;
  收藏: number | null;
  文案内容: string;
  发布时间: string;
  上传时间: string;
};

const DAILY_REPORT_COLUMNS: Array<{ header: keyof DailyReportExcelRow; width: number }> = [
  { header: "日期", width: 12 },
  { header: "提交人", width: 10 },
  { header: "视频标题", width: 30 },
  { header: "播放量(万)", width: 12 },
  { header: "完播率", width: 10 },
  { header: "平均播放时长", width: 14 },
  { header: "2s跳出率", width: 10 },
  { header: "5s完播率", width: 10 },
  { header: "涨粉", width: 8 },
  { header: "导粉", width: 8 },
  { header: "点赞", width: 8 },
  { header: "评论", width: 8 },
  { header: "分享", width: 8 },
  { header: "收藏", width: 8 },
  { header: "文案内容", width: 40 },
  { header: "发布时间", width: 18 },
  { header: "上传时间", width: 18 },
];

export async function buildDailyReportWorkbookBuffer(rows: DailyReportExcelRow[]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("数据日报");
  worksheet.columns = DAILY_REPORT_COLUMNS.map(({ header, width }) => ({
    header,
    key: header,
    width,
  }));
  worksheet.addRows(rows);
  const output = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(output);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
