# Task: Video Submit Flow (CC-1)

## Parallel Notice
3 Claude Code agents working simultaneously in ~/Projects/dydata/:
- CC-1 (YOU): Video submit flow in dashboard
- CC-2: Video list + management in admin/videos/
- CC-3: Market context page in admin/market/

You are CC-1. Only touch files in your scope. Do NOT modify files outside your scope.

## Your Scope
- src/app/(app)/dashboard/video-submit-panel.tsx (NEW client component)
- src/app/(app)/dashboard/video-submit-form.tsx (NEW client component)
- src/app/api/video-submit/route.ts (NEW API route)
- You may import from src/types/index.ts and src/lib/ but do NOT modify them

## Do NOT Touch
- src/app/(app)/dashboard/page.tsx (do not modify)
- src/app/(app)/dashboard/日报提交面板.tsx (do not modify)
- src/app/(app)/dashboard/dashboard-form.tsx (do not modify)
- Any files in admin/
- src/types/index.ts
- src/lib/video-metrics.ts

## Requirements

### 1. video-submit-panel.tsx (Client Component)
A "use client" wrapper component that manages the video submission flow.

Props:
```typescript
interface VideoSubmitPanelProps {
  accounts: { id: string; name: string; content_direction: string | null }[];
  userId: string;
  today: string;
}
```

Features:
- Account selector dropdown (if multiple accounts)
- Shows submission status per account for today
- Contains the VideoSubmitForm

### 2. video-submit-form.tsx (Client Component)
The actual form for submitting a video record.

Fields:
- video_url: text input (抖音视频链接, optional)
- video_title: text input (视频标题, optional)
- content: textarea (文案, 员工粘贴)
- published_at: datetime-local input (发布时间)
- anomaly_status: select dropdown with options: 正常/删稿/限流/投流/活动干预/未满24h (default: 正常)
- Screenshots upload section:
  - data_screenshot: file upload (数据截图)
  - curve_screenshot: file upload (推流曲线截图)
  - retention_screenshot: file upload (跳出回看截图)
- Metrics fields (from OCR or manual input):
  - play_count (播放量, number)
  - likes (点赞, number)
  - comments (评论, number)
  - shares (转发, number)
  - favorites (收藏, number)
  - follower_gain (涨粉, number)
  - follower_loss (脱粉, number)
  - follower_convert (导粉, number)

On screenshot upload, call existing /api/ocr-screenshot to extract metrics and prefill fields.

Use shadcn/ui components: Card, Button, Input, Select, Label, Sonner toast.
Use createClient from "@/lib/supabase/client" for browser-side Supabase.

### 3. /api/video-submit/route.ts (API Route)
POST handler that:
1. Auth check (get user from supabase)
2. Validate required fields (account_id is required)
3. Insert into `videos` table
4. Insert into `video_metrics_snapshots` table (snapshot_type: "24h")
5. Also insert a compatible row into `daily_reports` for backward compatibility:
   - Map: video play_count → daily_reports.play_count, likes → likes, etc.
   - report_date = today
   - title = video_title or "视频提交"
   - submitter = user profile name
6. Return the created video record

### Visual Style
Apple/macOS style: rounded-xl borders, generous padding, muted backgrounds, clean typography.
Use motion from framer-motion for subtle enter animations if appropriate.

### Completion Checklist
- [ ] npm run build passes with zero errors
- [ ] All new files are within scope
- [ ] No modifications to existing files
- [ ] Types imported from @/types, not redefined
- [ ] Supabase client usage matches existing patterns
