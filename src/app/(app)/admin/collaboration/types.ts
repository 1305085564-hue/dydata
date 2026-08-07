export interface SummaryData {
  total: number;
  attributed: number;
  selfHandled: number;
  unattributed: number;
  neverFillMembers: Array<{ userId: string; name: string }>;
}

export interface OperatorAccount {
  accountId: string;
  accountName: string;
  ownerName: string;
  reportCount: number;
  totalPlay: number;
  totalFollowerConvert: number;
}

export interface OperatorRow {
  userId: string;
  name: string;
  reportCount: number;
  totalPlay: number;
  avgPlay: number;
  totalFollowerConvert: number;
  hitCount: number;
  momChange: number | null;
  operatedProfileCount: number;
  accounts: OperatorAccount[];
}

export interface StaffAccount {
  accountId: string;
  accountName: string;
}

export interface StaffRow {
  userId: string;
  name: string;
  reportCount: number;
  totalPlay: number;
  avgPlay: number;
  selfHandledCount: number;
  involvedAccounts: StaffAccount[];
  involvedAccountTotal: number;
}

export interface PersonCurrentMonth {
  writerCount: number;
  editorCount: number;
  operatorCount: number;
}

export interface PersonOperatorSummary {
  reportCount: number;
  totalPlay: number;
  avgPlay: number;
  totalFollowerConvert: number;
  hitCount: number;
  momChange: number | null;
  operatedProfileCount: number;
}

export interface PersonTrendItem {
  year: number;
  month: number;
  writerCount: number;
  editorCount: number;
  operatorCount: number;
}

export interface PersonRecordItem {
  reportId: string;
  reportDate: string;
  accountId: string;
  accountName: string;
  title: string;
  playCount: number;
  roles: Array<"writer" | "editor" | "operator">;
  anomaly: string | null;
}

export interface PersonDetailData {
  userId: string;
  name: string;
  teamId: string | null;
  currentMonth: PersonCurrentMonth;
  operatorSummary: PersonOperatorSummary | null;
  trend: PersonTrendItem[];
  records: PersonRecordItem[];
}

export function formatBigNumber(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return "—";
  if (val >= 1e8) return `${(val / 1e8).toFixed(1)}亿`;
  if (val >= 1e4) return `${(val / 1e4).toFixed(1)}万`;
  return val.toLocaleString("zh-CN");
}
