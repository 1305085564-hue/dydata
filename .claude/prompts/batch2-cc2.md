# Task: Video List + Management Page (CC-2)

## Parallel Notice
3 Claude Code agents working simultaneously in ~/Projects/dydata/:
- CC-1: Video submit flow in dashboard
- CC-2 (YOU): Video list + management in admin/videos/
- CC-3: Market context page in admin/market/

You are CC-2. Only touch files in your scope. Do NOT modify files outside your scope.

## Your Scope (ALL NEW FILES)
- src/app/(app)/admin/videos/page.tsx (NEW server component)
- src/app/(app)/admin/videos/video-list.tsx (NEW client component)
- src/app/(app)/admin/videos/video-detail-dialog.tsx (NEW client component)
- src/app/(app)/admin/videos/video-filters.tsx (NEW client component)
- src/app/(app)/admin/videos/补录24h.tsx (NEW client component)

## Do NOT Touch
- Any files outside admin/videos/
- src/types/index.ts
- src/lib/
- src/app/(app)/dashboard/
- src/app/(app)/admin/page.tsx
- src/app/(app)/admin/analytics/

## Tech Context
- Next.js 16 + React 19 + Supabase + shadcn/ui + framer-motion
- Supabase server client: `import { createClient } from "@/lib/supabase/server"`
- Supabase browser client: `import { createClient } from "@/lib/supabase/client"`
- Types: `import { Video, VideoMetricsSnapshot, AnomalyStatus, ... } from "@/types"`
- UI components: Card, Table, Badge, Button, Dialog, Input, Select, Label from "@/components/ui/"
- Existing pattern: server component page.tsx fetches data, passes to client components

## Requirements

### 1. page.tsx (Server Component)
- Auth check + permission check (admin/owner only, use `getUserPermissions` from `@/lib/permissions`)
- Fetch videos with joined account name + owner name from profiles
- Fetch video_metrics_snapshots for each video
- Pass data to VideoList client component
- Add navigation: link in admin sidebar or breadcrumb back to /admin

### 2. video-list.tsx (Client Component)
Table view of all videos with columns:
- 视频标题 (or truncated video_url if no title)
- 账号 (account name)
- 负责人 (owner name from profiles)
- 发布时间 (published_at, formatted)
- 24h播放量 (from snapshot)
- 互动率 (calculated: (likes+comments+favorites+shares)/play_count, show as %)
- 涨粉 (follower_gain from snapshot)
- 状态 (anomaly_status as colored Badge)
- 操作 (查看详情 button, 补录24h button if no 24h snapshot)

Sort by published_at desc by default.
Use shadcn Table component.

### 3. video-filters.tsx (Client Component)
Filter bar above the table:
- 负责人 filter (select from profiles list)
- 账号 filter (select from accounts list)
- 日期范围 filter (start date + end date inputs)
- 状态 filter (select from AnomalyStatus options)
- Reset button

Filters work client-side on the passed data array.

### 4. video-detail-dialog.tsx (Client Component)
Dialog/modal showing full video details:
- Video info: title, url (clickable link), content (文案, scrollable), published_at, anomaly_status
- Metrics card: all fields from VideoMetricsSnapshot, formatted nicely
- Screenshots: display screenshot_urls, curve_screenshot_url, retention_screenshot_url as images
- Calculated metrics: 互动率, 粉转率, 导粉率, 主页访问率, 爆款系数 (import functions from @/lib/video-metrics)

Use shadcn Dialog component. Apple/macOS visual style.

### 5. 补录24h.tsx (Client Component)
A dialog form for adding 24h snapshot data to a video that doesn't have one yet.
- Fields: play_count, likes, comments, shares, favorites, follower_gain, follower_loss, follower_convert, homepage_visits
- Screenshot upload (data_screenshot)
- On submit: POST to insert into video_metrics_snapshots with snapshot_type="24h"
- Use Supabase browser client directly (no need for separate API route)

### Visual Style
Apple/macOS: rounded-xl, generous whitespace, muted-foreground for secondary text, Badge colors for status (green=正常, red=删稿/限流, yellow=投流/活动干预, gray=未满24h).

### Completion Checklist
- [ ] npm run build passes with zero errors
- [ ] All new files are within admin/videos/ directory only
- [ ] No modifications to any existing files
- [ ] Types imported from @/types, not redefined
- [ ] Permission check on page.tsx
- [ ] Supabase patterns match existing codebase
