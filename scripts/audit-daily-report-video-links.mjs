#!/usr/bin/env node

import "dotenv/config";
import fs from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const SHANGHAI_TZ = "Asia/Shanghai";

function parseArgs(argv) {
  const args = { days: 14, apply: null, confirm: false, summaryOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (item === "--days") args.days = Number(argv[++i]);
    else if (item === "--from") args.from = argv[++i];
    else if (item === "--to") args.to = argv[++i];
    else if (item === "--summary-only") args.summaryOnly = true;
    else if (item === "--apply") args.apply = argv[++i];
    else if (item === "--i-understand-this-mutates-data") args.confirm = true;
    else if (item === "--help" || item === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${item}`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  node --env-file-if-exists=.env.local scripts/audit-daily-report-video-links.mjs
  node --env-file-if-exists=.env.local scripts/audit-daily-report-video-links.mjs --summary-only
  node --env-file-if-exists=.env.local scripts/audit-daily-report-video-links.mjs --from 2026-08-25 --to 2026-09-07

Dry-run is the default and does not mutate data.

Apply mode requires all three gates:
  1) --apply ./confirmed-decisions.json
  2) --i-understand-this-mutates-data
  3) ALLOW_DAILY_REPORT_VIDEO_LINK_APPLY=1

Decision file shape:
{
  "report_bindings": [{ "report_id": "uuid", "video_id": "uuid" }],
  "void_reports": [{ "report_id": "uuid", "reason": "confirmed_orphan" }]
}`);
}

function assertBizDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
  return value;
}

function toBizDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function defaultRange(days) {
  if (!Number.isInteger(days) || days < 1 || days > 60) {
    throw new Error("--days must be an integer between 1 and 60");
  }
  const today = new Date();
  const to = toBizDate(today);
  const from = toBizDate(addDays(today, -(days - 1)));
  return { from, to };
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function dateFromMaybeTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return toBizDate(date);
}

function matchesReportDate(video, reportDate) {
  return [video.published_at, video.uploaded_at]
    .map(dateFromMaybeTimestamp)
    .some((date) => date === reportDate);
}

function redactReport(report) {
  return {
    report_id: report.id,
    user_id: report.user_id,
    account_id: report.account_id,
    report_date: report.report_date,
    title: report.title,
    video_id: report.video_id,
    is_void: report.is_void,
  };
}

function redactVideo(video) {
  return {
    video_id: video.id,
    user_id: video.user_id,
    account_id: video.account_id,
    published_at: video.published_at,
    uploaded_at: video.uploaded_at,
    lifecycle_state: video.lifecycle_state,
    title: video.video_title,
  };
}

async function fetchPaged(buildQuery, label) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) throw new Error(`${label} failed: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function fetchReports(supabase, from, to) {
  const baseQuery = (columns) => supabase
    .from("daily_reports")
    .select(columns)
    .gte("report_date", from)
    .lte("report_date", to)
    .eq("is_void", false)
    .order("report_date", { ascending: true })
    .limit(10000);

  const withLink = await baseQuery("id, user_id, account_id, report_date, title, video_id, is_void");
  if (!withLink.error) return withLink.data ?? [];
  if (!/video_id/i.test(withLink.error.message ?? "")) {
    throw new Error(`daily_reports query failed: ${withLink.error.message}`);
  }

  const withoutLink = await baseQuery("id, user_id, account_id, report_date, title, is_void");
  if (withoutLink.error) throw new Error(`daily_reports query failed: ${withoutLink.error.message}`);
  return (withoutLink.data ?? []).map((report) => ({ ...report, video_id: null }));
}

async function applyDecisions(supabase, path, confirm) {
  if (!confirm || process.env.ALLOW_DAILY_REPORT_VIDEO_LINK_APPLY !== "1") {
    throw new Error("Apply blocked: provide --i-understand-this-mutates-data and ALLOW_DAILY_REPORT_VIDEO_LINK_APPLY=1");
  }
  const raw = await fs.readFile(path, "utf8");
  const decisions = JSON.parse(raw);
  const bindings = Array.isArray(decisions.report_bindings) ? decisions.report_bindings : [];
  const voids = Array.isArray(decisions.void_reports) ? decisions.void_reports : [];

  const applied = { report_bindings: 0, void_reports: 0 };
  for (const binding of bindings) {
    if (typeof binding.report_id !== "string" || typeof binding.video_id !== "string") {
      throw new Error("Invalid report_bindings item");
    }
    const { error } = await supabase
      .from("daily_reports")
      .update({ video_id: binding.video_id })
      .eq("id", binding.report_id)
      .eq("is_void", false);
    if (error) throw new Error(`Bind ${binding.report_id} failed: ${error.message}`);
    applied.report_bindings++;
  }

  for (const item of voids) {
    if (typeof item.report_id !== "string") throw new Error("Invalid void_reports item");
    const reason = typeof item.reason === "string" && item.reason.trim() ? item.reason.trim() : "confirmed_orphan";
    const { error } = await supabase
      .from("daily_reports")
      .update({ is_void: true, review_status: "void", voided_at: new Date().toISOString(), voided_reason: reason })
      .eq("id", item.report_id)
      .eq("is_void", false);
    if (error) throw new Error(`Void ${item.report_id} failed: ${error.message}`);
    applied.void_reports++;
  }
  return applied;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fallback = defaultRange(args.days);
  const from = assertBizDate(args.from ?? fallback.from, "--from");
  const to = assertBizDate(args.to ?? fallback.to, "--to");
  if (from > to) throw new Error("--from cannot be after --to");

  const supabase = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  if (args.apply) {
    const applied = await applyDecisions(supabase, args.apply, args.confirm);
    console.log(JSON.stringify({ mode: "apply", applied }, null, 2));
    return;
  }

  const reports = await fetchReports(supabase, from, to);
  const accountIds = [...new Set(reports.map((report) => report.account_id).filter(Boolean))];

  const videos = accountIds.length
    ? await fetchPaged(
      (fromRow, toRow) => supabase
          .from("videos")
          .select("id, user_id, account_id, video_title, published_at, uploaded_at, lifecycle_state")
          .in("account_id", accountIds)
          .eq("lifecycle_state", "active")
          .order("uploaded_at", { ascending: true, nullsFirst: true })
          .range(fromRow, toRow),
      "videos query",
    )
    : [];
  const videosByAccount = new Map();
  const activeVideoIds = new Set();
  for (const video of videos) {
    activeVideoIds.add(video.id);
    const list = videosByAccount.get(video.account_id) ?? [];
    list.push(video);
    videosByAccount.set(video.account_id, list);
  }

  const orphan_unlinked = [];
  const conflict_unlinked = [];
  const unique_unlinked_candidates = [];
  const linked_inactive = [];

  for (const report of reports) {
    const candidates = (videosByAccount.get(report.account_id) ?? []).filter((video) => matchesReportDate(video, report.report_date));
    if (report.video_id) {
      if (!activeVideoIds.has(report.video_id)) linked_inactive.push({ report: redactReport(report), matched_active_videos: candidates.map(redactVideo) });
      continue;
    }
    if (candidates.length === 0) orphan_unlinked.push({ report: redactReport(report), matched_active_videos: [] });
    else if (candidates.length === 1) unique_unlinked_candidates.push({ report: redactReport(report), matched_active_videos: candidates.map(redactVideo) });
    else conflict_unlinked.push({ report: redactReport(report), matched_active_videos: candidates.map(redactVideo) });
  }

  const output = {
    mode: "dry-run",
    range: { from, to, timezone: SHANGHAI_TZ },
    summary: {
      reports_scanned: reports.length,
      active_videos_scanned: videos.length,
      orphan_unlinked: orphan_unlinked.length,
      conflict_unlinked: conflict_unlinked.length,
      linked_inactive: linked_inactive.length,
      unique_unlinked_candidates: unique_unlinked_candidates.length,
    },
    orphan_unlinked,
    conflict_unlinked,
    linked_inactive,
    unique_unlinked_candidates,
  };

  if (args.summaryOnly) {
    console.log(JSON.stringify({ mode: output.mode, range: output.range, summary: output.summary }, null, 2));
  } else {
    console.log(JSON.stringify(output, null, 2));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
