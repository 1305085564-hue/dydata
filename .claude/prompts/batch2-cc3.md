# Task: Market Context Management Page (CC-3)

## Parallel Notice
3 Claude Code agents working simultaneously in ~/Projects/dydata/:
- CC-1: Video submit flow in dashboard
- CC-2: Video list + management in admin/videos/
- CC-3 (YOU): Market context page in admin/market/

You are CC-3. Only touch files in your scope. Do NOT modify files outside your scope.

## Your Scope (ALL NEW FILES)
- src/app/(app)/admin/market/page.tsx (NEW server component)
- src/app/(app)/admin/market/market-form.tsx (NEW client component)
- src/app/(app)/admin/market/market-list.tsx (NEW client component)

## Do NOT Touch
- Any files outside admin/market/
- src/types/index.ts
- src/lib/video-metrics.ts
- src/app/(app)/dashboard/
- src/app/(app)/admin/page.tsx
- src/app/(app)/admin/videos/
- src/app/(app)/admin/analytics/

## Tech Context
- Next.js 16 + React 19 + Supabase + shadcn/ui + framer-motion
- Supabase server client: `import { createClient } from "@/lib/supabase/server"`
- Supabase browser client: `import { createClient } from "@/lib/supabase/client"`
- Types: `import { MarketContextDaily, MarketSentiment } from "@/types"`
- UI components: Card, Table, Badge, Button, Input, Select, Label, Checkbox from "@/components/ui/"
- Permission check: `import { getUserPermissions } from "@/lib/permissions"`

## The market_context_daily Table Schema
```sql
id uuid PK default gen_random_uuid()
context_date date UNIQUE
is_trading_day boolean
market_change jsonb  -- e.g. {"上证": 1.2, "深成指": -0.5, "创业板": 0.8}
market_sentiment text  -- 强/中/弱
hot_sectors text[]
source text  -- "manual" or "api"
updated_by uuid FK -> profiles
created_at timestamptz default now()
```

## Requirements

### 1. page.tsx (Server Component)
- Auth check + permission check (admin/owner only)
- Fetch recent 30 days of market_context_daily, ordered by context_date desc
- Pass data to client components
- Page title: "市场环境管理"

### 2. market-form.tsx (Client Component)
Form for creating/editing a market context entry.

Fields:
- context_date: date input (default today)
- is_trading_day: checkbox (default true)
- market_change: 3 number inputs in a row:
  - 上证涨跌幅 (%)
  - 深成指涨跌幅 (%)
  - 创业板涨跌幅 (%)
  - Store as jsonb: {"上证": number, "深成指": number, "创业板": number}
- market_sentiment: select with options 强/中/弱
- hot_sectors: text input, comma-separated, stored as text[] (e.g. "AI,新能源,军工" -> ["AI","新能源","军工"])

On submit:
- Use Supabase browser client
- Upsert into market_context_daily (on conflict context_date)
- Set source = "manual", updated_by = current user id
- Show success toast (sonner)
- Refresh the list

Support edit mode: when clicking an existing row, populate the form with that row's data.

### 3. market-list.tsx (Client Component)
Table showing recent market context entries:

Columns:
- 日期 (context_date)
- 交易日 (is_trading_day: ✅/❌)
- 上证 (from market_change jsonb, colored: green if positive, red if negative)
- 深成指 (same)
- 创业板 (same)
- 情绪 (market_sentiment as colored Badge: 强=green, 中=yellow, 弱=red)
- 热点板块 (hot_sectors joined with comma)
- 操作 (编辑 button -> triggers edit mode in form)

Use shadcn Table component.

### Visual Style
Apple/macOS: rounded-xl, clean layout, form on top + list below on same page.
Market change numbers: green text for positive, red for negative, with +/- prefix and % suffix.
Generous padding, muted backgrounds for cards.

### Completion Checklist
- [ ] npm run build passes with zero errors
- [ ] All new files are within admin/market/ directory only
- [ ] No modifications to any existing files
- [ ] Types imported from @/types, not redefined
- [ ] Upsert logic handles duplicate dates correctly
- [ ] Permission check on page.tsx
