import React from "react";

interface IllustrationProps {
  className?: string;
  size?: number;
}

/**
 * 1. 案头与书卷手稿 (Desk & Manuscript)
 * 意象：翻开的书页、墨水笔与柔和灯影，象征创作者的思想案头。
 * 适用：登录迎宾、首页、创作起始页。
 */
export function DeskStudyIllustration({ className = "", size = 120 }: IllustrationProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`select-none ${className}`}
      aria-hidden="true"
    >
      {/* 柔和漫反射背景光晕 */}
      <circle cx="80" cy="80" r="54" fill="#F5F3EE" fillOpacity="0.85" />
      <circle cx="80" cy="74" r="38" fill="#FAF8F4" />

      {/* 案头基准发丝线 */}
      <line x1="28" y1="122" x2="132" y2="122" stroke="#E5E0D6" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="42" y1="126" x2="118" y2="126" stroke="#ECE7DE" strokeWidth="1" strokeLinecap="round" strokeDasharray="3 3" />

      {/* 翻开的手稿书页 (Open Manuscript Book) */}
      <g transform="translate(42, 68)">
        {/* 书页阴影底色 */}
        <path
          d="M6 34C18 31 34 33 38 37C42 33 58 31 70 34V46C58 43 42 45 38 49C34 45 18 43 6 46V34Z"
          fill="#EAE5DC"
          fillOpacity="0.6"
        />
        {/* 左页 */}
        <path
          d="M6 32C18 29 34 31 38 35V47C34 43 18 41 6 44V32Z"
          fill="#FFFFFF"
          stroke="#292524"
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
        {/* 右页 */}
        <path
          d="M38 35C42 31 58 29 70 32V44C58 41 42 43 38 47V35Z"
          fill="#FFFFFF"
          stroke="#292524"
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
        {/* 书脊中缝 */}
        <line x1="38" y1="35" x2="38" y2="47" stroke="#292524" strokeWidth="1.25" />

        {/* 左页模拟排版线条 */}
        <line x1="12" y1="36" x2="32" y2="35" stroke="#A8A29E" strokeWidth="1" strokeLinecap="round" />
        <line x1="12" y1="39" x2="28" y2="38.5" stroke="#A8A29E" strokeWidth="1" strokeLinecap="round" />
        <line x1="12" y1="42" x2="30" y2="41.5" stroke="#A8A29E" strokeWidth="1" strokeLinecap="round" />

        {/* 右页模拟排版线条 */}
        <line x1="44" y1="35" x2="64" y2="36" stroke="#A8A29E" strokeWidth="1" strokeLinecap="round" />
        <line x1="44" y1="38.5" x2="60" y2="39" stroke="#A8A29E" strokeWidth="1" strokeLinecap="round" />
        <line x1="44" y1="41.5" x2="56" y2="42" stroke="#A8A29E" strokeWidth="1" strokeLinecap="round" />
      </g>

      {/* 墨水瓶与羽毛笔 (Inkwell & Quill) */}
      <g transform="translate(100, 78)">
        {/* 墨水瓶身 */}
        <rect x="10" y="24" width="16" height="18" rx="3" fill="#FAF8F4" stroke="#292524" strokeWidth="1.25" />
        <rect x="13" y="20" width="10" height="4" rx="1" fill="#D97757" stroke="#292524" strokeWidth="1" />
        {/* 瓶中微墨 */}
        <path d="M12 34C14 33 22 33 24 34V39C24 40.5 22.5 41 21 41H15C13.5 41 12 40.5 12 39V34Z" fill="#D97757" fillOpacity="0.3" />

        {/* 考究的倾斜羽毛笔 (Quill) */}
        <path
          d="M19 22L34 -8C32 -5 27 -2 24 2C21 6 18 14 17 22Z"
          fill="#FAF8F4"
          stroke="#292524"
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
        {/* 笔羽细脉 */}
        <line x1="18" y1="22" x2="33" y2="-6" stroke="#292524" strokeWidth="1" />
        <path d="M26 4L31 2M23 10L28 8M20 16L24 15" stroke="#78716C" strokeWidth="0.8" strokeLinecap="round" />
      </g>

      {/* 案头灵感微星芒 */}
      <g transform="translate(48, 44)">
        <path d="M0 6C3 6 6 3 6 0C6 3 9 6 12 6C9 6 6 9 6 12C6 9 3 6 0 6Z" fill="#D97757" />
      </g>
      <circle cx="118" cy="48" r="1.5" fill="#B98A54" />
      <circle cx="36" cy="76" r="1" fill="#78716C" />
    </svg>
  );
}

/**
 * 2. 探索罗盘与生长麦穗 (Compass & Seedling)
 * 意象：精密航海罗盘、星宿轨迹与新生的植物枝叶，象征数据洞察与持续成长。
 * 适用：成长复盘、AI 诊断、深度分析页。
 */
export function CompassConstellationIllustration({ className = "", size = 120 }: IllustrationProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`select-none ${className}`}
      aria-hidden="true"
    >
      {/* 柔和背景气垫 */}
      <circle cx="80" cy="80" r="54" fill="#F5F3EE" fillOpacity="0.8" />

      {/* 罗盘外圈刻度环 */}
      <circle cx="80" cy="80" r="42" stroke="#E5E0D6" strokeWidth="1.2" strokeDasharray="2 3" />
      <circle cx="80" cy="80" r="34" stroke="#292524" strokeWidth="1.25" />

      {/* 罗盘四方位刻度线 */}
      <line x1="80" y1="42" x2="80" y2="48" stroke="#292524" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="80" y1="112" x2="80" y2="118" stroke="#292524" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="42" y1="80" x2="48" y2="80" stroke="#292524" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="112" y1="80" x2="118" y2="80" stroke="#292524" strokeWidth="1.5" strokeLinecap="round" />

      {/* 罗盘指针 (精细双色指针) */}
      <g transform="rotate(32 80 80)">
        {/* 北针 - 暖陶土色 */}
        <polygon points="80,52 84.5,80 80,77" fill="#D97757" />
        <polygon points="80,52 75.5,80 80,77" fill="#C46A4D" />
        {/* 南针 - 暖墨色 */}
        <polygon points="80,108 84.5,80 80,83" fill="#78716C" />
        <polygon points="80,108 75.5,80 80,83" fill="#292524" />
        {/* 中心轴微轴承 */}
        <circle cx="80" cy="80" r="3.5" fill="#FAF8F4" stroke="#292524" strokeWidth="1.2" />
        <circle cx="80" cy="80" r="1.5" fill="#D97757" />
      </g>

      {/* 破土而出的新生橄榄枝叶 (Seedling of Growth) */}
      <g transform="translate(102, 38)">
        <path
          d="M2 42C6 32 14 24 24 20"
          stroke="#6FAA7D"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
        {/* 叶片 1 */}
        <path
          d="M10 32C10 32 16 30 18 24C12 24 10 30 10 32Z"
          fill="#6FAA7D"
          fillOpacity="0.25"
          stroke="#6FAA7D"
          strokeWidth="1"
        />
        {/* 叶片 2 */}
        <path
          d="M18 24C18 24 25 21 26 14C20 15 18 22 18 24Z"
          fill="#6FAA7D"
          fillOpacity="0.25"
          stroke="#6FAA7D"
          strokeWidth="1"
        />
      </g>

      {/* 星宿坐标微符 */}
      <g transform="translate(36, 42)">
        <path d="M0 4C2 4 4 2 4 0C4 2 6 4 8 4C6 4 4 6 4 8C4 6 2 4 0 4Z" fill="#D97757" />
      </g>
    </svg>
  );
}

/**
 * 3. 静谧归档与茶歇 (Zen Finished & Tea)
 * 意象：温润的茶盏、整齐收拢的手稿封卷与宁静光晕，象征今日事毕、从容收卷。
 * 适用：今日已提交空状态、全部审批完成、安心休息提示。
 */
export function ZenFinishedIllustration({ className = "", size = 120 }: IllustrationProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`select-none ${className}`}
      aria-hidden="true"
    >
      {/* 漫反射宁静暖底 */}
      <circle cx="80" cy="80" r="54" fill="#F5F3EE" fillOpacity="0.9" />

      {/* 桌面基线 */}
      <line x1="32" y1="120" x2="128" y2="120" stroke="#E5E0D6" strokeWidth="1.5" strokeLinecap="round" />

      {/* 收整齐的手稿封套 (Archived Folio) */}
      <g transform="translate(38, 76)">
        {/* 底层封套 */}
        <rect x="0" y="22" width="46" height="18" rx="2" fill="#EAE5DC" stroke="#292524" strokeWidth="1.2" />
        {/* 绑带与火漆印痕 */}
        <line x1="16" y1="22" x2="16" y2="40" stroke="#78716C" strokeWidth="1" />
        <circle cx="16" cy="31" r="3" fill="#D97757" />
        {/* 顶层略微错开的纸张 */}
        <rect x="2" y="16" width="42" height="6" rx="1" fill="#FFFFFF" stroke="#292524" strokeWidth="1" />
        <line x1="8" y1="19" x2="24" y2="19" stroke="#A8A29E" strokeWidth="0.8" strokeLinecap="round" />
      </g>

      {/* 冒着微热气的茶盏 (Teacup) */}
      <g transform="translate(94, 78)">
        {/* 杯托碟 */}
        <ellipse cx="20" cy="40" rx="16" ry="2.5" fill="#FAF8F4" stroke="#292524" strokeWidth="1.2" />
        {/* 茶杯身 */}
        <path
          d="M8 24H32C32 24 31 38 20 38C9 38 8 24 8 24Z"
          fill="#FAF8F4"
          stroke="#292524"
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
        {/* 杯把手 */}
        <path
          d="M32 27C35 27 37 29 37 31C37 33 35 34 32 34"
          stroke="#292524"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        {/* 茶汤微波 */}
        <ellipse cx="20" cy="26" rx="9" ry="2" fill="#B98A54" fillOpacity="0.25" />

        {/* 袅袅上升的热气 (Gentle Steam) */}
        <path
          d="M17 18C16 15 18 13 17 10"
          stroke="#D97757"
          strokeWidth="1"
          strokeLinecap="round"
          strokeOpacity="0.7"
        />
        <path
          d="M23 19C24 16 22 14 23 11"
          stroke="#A8A29E"
          strokeWidth="1"
          strokeLinecap="round"
          strokeOpacity="0.6"
        />
      </g>

      {/* 宁静星光微符 */}
      <g transform="translate(74, 46)">
        <path d="M0 4C2 4 4 2 4 0C4 2 6 4 8 4C6 4 4 6 4 8C4 6 2 4 0 4Z" fill="#6FAA7D" />
      </g>
    </svg>
  );
}

/**
 * 4. 出版物卷尾徽记 / 章节微符 (Colophon Mark)
 * 适用：页面底部收卷、卡片段落分隔。
 */
export function ColophonMark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-3 py-6 select-none ${className}`} aria-hidden="true">
      <span className="h-[1px] w-8 bg-[#ECE7DE]" />
      <span className="text-[12px] text-[#A8A29E]">✦</span>
      <span className="h-[1px] w-8 bg-[#ECE7DE]" />
    </div>
  );
}
