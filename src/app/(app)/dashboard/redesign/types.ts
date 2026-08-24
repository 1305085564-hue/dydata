// 今日提交工作台 - 类型定义
// 基于原页面完整功能的类型系统

export interface Account {
  id: string;
  name: string;
  display_name: string;
  content_direction: string | null;
}

export interface TodayReport {
  id?: string;
  account_id: string;
  report_date: string;
  video_url?: string | null;
  title?: string | null;
  published_at?: string | null;
  play_count?: number | null;
  completion_rate?: string | null;
  avg_play_duration?: string | null;
  bounce_rate_2s?: string | null;
  completion_rate_5s?: string | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  favorites?: number | null;
  follower_gain?: number | null;
  follower_convert?: number | null;
  content?: string | null;
  content_direction?: string | null;
  notes?: string | null;
  uploaded_at?: string | null;
  operator_user_id?: string | null;
}

export interface ExemptionGrant {
  id: string;
  user_id: string;
  exempt_date: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_at?: string | null;
  reviewer_id?: string | null;
  created_at: string;
}

export interface ExemptionProfile {
  user_id: string;
  total_granted: number;
  last_granted_at?: string | null;
}

export type SubmitPanelMode = 'empty' | 'editing' | 'submitting' | 'submitted';

export interface ScreenshotSlot {
  role: 'cover' | 'middle' | 'ending';
  file?: File;
  url?: string;
  ocrStatus?: 'idle' | 'uploading' | 'processing' | 'success' | 'error';
  ocrError?: string;
  ocrData?: {
    play_count?: number;
    likes?: number;
    comments?: number;
    shares?: number;
  };
}

export interface VideoSubmitFormData {
  video_url: string;
  published_at: string;
  operator_user_id: string;
  play_count: string;
  completion_rate: string;
  avg_play_duration: string;
  likes: string;
  comments: string;
  shares: string;
  favorites: string;
  follower_gain: string;
  follower_convert: string;
  content_direction: string;
  content: string;
  notes: string;
  screenshots: ScreenshotSlot[];
}

export interface AITag {
  tag_dimension: string;
  tag_value: string;
  confidence: number | null;
  reason: string | null;
}
