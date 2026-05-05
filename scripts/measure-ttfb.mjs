#!/usr/bin/env node

const DEFAULT_URLS = [
  "https://dydata.cc/dashboard",
  "https://dydata.cc/analytics",
  "https://dydata.cc/growth",
];

function parseArgs(argv) {
  const args = {
    count: 3,
    urls: [],
    cookie: process.env.TTFB_COOKIE ?? "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--count" || item === "-n") {
      args.count = Number(argv[index + 1] ?? args.count);
      index += 1;
      continue;
    }
    if (item === "--cookie") {
      args.cookie = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    args.urls.push(item);
  }

  if (!Number.isInteger(args.count) || args.count < 1) args.count = 3;
  if (args.urls.length === 0) args.urls = DEFAULT_URLS;
  return args;
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

async function measure(url, cookie) {
  const start = performance.now();
  const response = await fetch(url, {
    redirect: "manual",
    headers: cookie ? { cookie } : undefined,
  });
  const headersAt = performance.now();
  await response.arrayBuffer();
  const doneAt = performance.now();

  return {
    status: response.status,
    colo: response.headers.get("cf-ray")?.split("-")[1] ?? "-",
    cache: response.headers.get("cf-cache-status") ?? "-",
    serverTiming: response.headers.get("server-timing") ?? "-",
    ttfb: Math.round(headersAt - start),
    total: Math.round(doneAt - start),
  };
}

const args = parseArgs(process.argv.slice(2));

for (const url of args.urls) {
  const samples = [];
  console.log(`\n${url}`);

  for (let index = 0; index < args.count; index += 1) {
    const sample = await measure(url, args.cookie);
    samples.push(sample);
    console.log(
      `#${index + 1} status=${sample.status} ttfb=${sample.ttfb}ms total=${sample.total}ms cf=${sample.colo} cache=${sample.cache}`,
    );
  }

  const ttfbs = samples.map((sample) => sample.ttfb);
  const totals = samples.map((sample) => sample.total);
  console.log(
    `summary ttfb p50=${percentile(ttfbs, 50)}ms p95=${percentile(ttfbs, 95)}ms total p50=${percentile(totals, 50)}ms`,
  );
}
