export interface PremiumAccount {
  id: string;
  name: string;
  display_name: string;
  content_direction: string;
  followers: string;
  healthScore: number;
  status: "active" | "warning" | "error";
  lastSync: string;
}

export interface PremiumTodo {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  severity: "critical" | "warning" | "info";
  category: "review" | "violation" | "report";
  completed: boolean;
}

export interface PremiumNotification {
  id: string;
  title: string;
  body: string;
  severity: "critical" | "warning" | "success" | "info";
  created_at: string;
  category: "todo" | "feed";
  read: boolean;
}

export const MOCK_ACCOUNTS: PremiumAccount[] = [
  {
    id: "acc-1",
    name: "dy_tech_explorer",
    display_name: "抖音科技探索者",
    content_direction: "前沿科技与数码测评",
    followers: "2.4M",
    healthScore: 98,
    status: "active",
    lastSync: "刚刚",
  },
  {
    id: "acc-2",
    name: "dy_life_hacks",
    display_name: "生活妙招研究所",
    content_direction: "日常实用生活技巧与辟谣",
    followers: "890K",
    healthScore: 85,
    status: "warning",
    lastSync: "12 分钟前",
  },
  {
    id: "acc-3",
    name: "dy_foodie_guide",
    display_name: "深夜食堂探店官",
    content_direction: "探店、美食评测与家常菜",
    followers: "4.1M",
    healthScore: 92,
    status: "active",
    lastSync: "1 小时前",
  },
  {
    id: "acc-4",
    name: "dy_gaming_hub",
    display_name: "超能游戏暴击队",
    content_direction: "热门游戏攻略与趣味剪辑",
    followers: "1.2M",
    healthScore: 78,
    status: "error",
    lastSync: "3 小时前",
  },
];

export const MOCK_TODOS: PremiumTodo[] = [
  {
    id: "todo-1",
    title: "复核「深夜食堂探店官」第083号视频违规话术",
    description: "视频中第 42 秒提及敏感极限词「最顶级」，请进行合规性标记并修改下发。",
    dueDate: "今天 12:00 前",
    severity: "critical",
    category: "violation",
    completed: false,
  },
  {
    id: "todo-2",
    title: "发布履约：「抖音科技探索者」周报审查",
    description: "本周发布频次未达标（要求5条，实际完成3条），需要批改并填写延迟说明。",
    dueDate: "今天 18:00 前",
    severity: "warning",
    category: "report",
    completed: false,
  },
  {
    id: "todo-3",
    title: "素材库入库确认：「生活妙招研究所」原创视频",
    description: "3个视频资产待完成水印盖印与最终发布确权。",
    dueDate: "明天 10:00 前",
    severity: "info",
    category: "review",
    completed: false,
  },
  {
    id: "todo-4",
    title: "跟进组员「张小伟」的日报批改意见反馈",
    description: "组员已针对昨日爆款视频进行了复盘分析，请核对并给予指导意见。",
    dueDate: "明天 18:00 前",
    severity: "info",
    category: "review",
    completed: false,
  },
];

export const MOCK_NOTIFICATIONS: PremiumNotification[] = [
  {
    id: "notif-1",
    title: "违规预警：账号「超能游戏暴击队」收到 1 条词汇限流警告",
    body: "触发敏感词：「挂机躺赢」，建议立即在素材库进行视频标记并更新违规话术库。",
    severity: "critical",
    created_at: "刚刚",
    category: "todo",
    read: false,
  },
  {
    id: "notif-2",
    title: "日报批改反馈已下发",
    body: "你提交的「抖音科技探索者」日报已被主管理员完成批改，主要问题为：选题重合度高，需要加强差异化定位。",
    severity: "warning",
    created_at: "5 分钟前",
    category: "feed",
    read: false,
  },
  {
    id: "notif-3",
    title: "发布计划履约成功",
    body: "「生活妙招研究所」今日 08:00 定时发布的视频《10个厨房整理绝招》已在抖音端自动同步上架，状态：正常。",
    severity: "success",
    created_at: "2 小时前",
    category: "feed",
    read: true,
  },
  {
    id: "notif-4",
    title: "系统通知：服务器完成 Supabase 数据库维护",
    body: "所有离线缓存数据已完成批量同步，日活报表加载速度已提升 40%。",
    severity: "info",
    created_at: "1 天前",
    category: "feed",
    read: true,
  },
];
