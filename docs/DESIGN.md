# DYData DESIGN.md (Claude Design System Edition)

> 权威中文版见：[Claude设计哲学.md](Claude设计哲学.md) 与 [Claude设计规范.md](Claude设计规范.md)。

## 1. Brand Context & Personality
- **Role**: 安静把活干完的靠谱搭档 (Quiet, competent partner).
- **Tone**: 知性出版物感 (Editorial warmth), 沉静专业 (Calm precision), 情绪透明 (Honest & direct).
- **Keywords**: Restrained, Humanistic, Anti-box, Tabular, Terracotta.

## 2. Color Palette & Tokens (Claude Official)
- **Canvas Base (页面大底)**: `#FBF9F5` (Warm Ivory Paper)
- **Surface Paper (纯白纸层)**: `#FFFFFF`
- **Subtle Cushion (微气垫)**: `#F5F3EE` (Light Sandstone Cushion)
- **Primary Action (暖陶土橙)**: `#D97757` (Hover: `#C46A4D`, Active: `#B85B3F`)
- **Location & Active (暴雨灰蓝)**: `#43718E` (Hover: `#365D76`)
- **Border Hairline (暖砂岩细边)**: `#E5E0D6` / `#ECE7DE`
- **Ink Palette (暖炭墨度)**:
  - `Ink 950` (`#1C1917`): Page Hero H1, H2
  - `Ink 800` (`#292524`): Section H3, Body text, Data text, Form inputs
  - `Ink 600` (`#78716C`): Table header, timestamps, metadata (Legibility baseline)
  - `Ink 400` (`#A8A29E`): Placeholder, disabled states, micro-badges

## 3. Typography Hierarchy
- **Font Stack**: Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif.
- **Numbers**: Always apply `tabular-nums` for tabular data.
- **Scale**:
  - `H1`: 24px / 600 weight / `#1C1917`
  - `H2`: 18px / 600 weight / `#1C1917`
  - `H3`: 16px / 500 weight / `#292524`
  - `H4`: 14px / 500 weight / `#292524`
  - `Body`: 14px / 400 weight / `#292524`
  - `Caption / Th`: 13px / 500 or 400 weight / `#78716C`
  - `Badge`: 12px / 500 weight / `#78716C`

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
- ❌ Do not make data tables transparent/yellow without a white paper sheet.
