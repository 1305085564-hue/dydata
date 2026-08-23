# DYData DESIGN.md (Claude Aesthetic Edition)

> 本文件遵循 getdesign.md / VoltAgent DESIGN.md 规范标准，定义 DYData 全站视觉与交互基因。

## 1. Brand Context & Personality
- **Role**: 安静把活干完的靠谱搭档 (Quiet, competent partner).
- **Tone**: 知性出版物感 (Editorial warmth), 沉静专业 (Calm precision), 情绪透明 (Honest & direct).
- **Keywords**: Restrained, Humanistic, Anti-box, Tabular, Terracotta.

## 2. Color Palette & Tokens
- **Canvas Base**: `#FAFAFA` (`zinc-50`)
- **Surface Paper**: `#FFFFFF`
- **Subtle Cushion (微气垫)**: `rgba(244, 244, 245, 0.7)` (`bg-zinc-100/70`)
- **Primary Action (暖陶土橙)**: `#D97757` (Hover: `#C46A4D`, Active: `#B85B3F`)
- **Location & Active (暴雨灰蓝)**: `#43718E` (Hover: `#365D76`)
- **Ink Palette**:
  - `zinc-950` (`#09090B`): Page Hero H1, H2
  - `zinc-900` (`#18181B`): Section H3, Modal Titles
  - `zinc-800` (`#27272A`): Body text, Data text, Form inputs
  - `zinc-600` (`#52525B`): Table header, timestamps, metadata
  - `zinc-400` (`#A1A1AA`): Placeholder, disabled states
  - `zinc-200` (`#E4E4E7`): Hairline border (Table only)

## 3. Typography Hierarchy
- **Font Stack**: Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif.
- **Numbers**: Always apply `tabular-nums` for alignment.
- **Scale**:
  - `H1`: 24px / 600 weight / `text-zinc-950`
  - `H2`: 18px / 600 weight / `text-zinc-950`
  - `H3`: 16px / 500 weight / `text-zinc-900`
  - `H4`: 14px / 500 weight / `text-zinc-900`
  - `Body`: 14px / 400 weight / `text-zinc-800`
  - `Caption / Th`: 13px / 500 or 400 weight / `text-zinc-600`
  - `Badge`: 12px / 500 weight / `text-zinc-500`

## 4. Layout & Spacing
- **4-Level Spatial Rhythms**:
  - `Rift (断层)`: 40px (gap-10 / mt-10)
  - `Breath (呼吸)`: 24px (gap-6 / mt-6)
  - `Tight (紧凑)`: 16px (gap-4 / mt-4)
  - `Intimate (亲密)`: 8px (gap-2 / mt-2)

## 5. Anti-Patterns & Do Not's
- ❌ Do not use card-in-card nesting (No card mosaics).
- ❌ Do not use font-semibold (600) on elements smaller than H2.
- ❌ Do not use decorative gradients or loud background glows.
- ❌ Do not show congratulatory toasts for standard non-destructive visible actions.
