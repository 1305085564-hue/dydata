#!/usr/bin/env node
import { access } from "node:fs/promises";
import process from "node:process";

const baseUrl = process.env.BASE_URL?.replace(/\/$/, "");
const requiredFiles = [
  "scripts/architecture-baseline.json",
  "src/lib/request-context.ts",
  "src/lib/errors.ts",
  "src/lib/timeout.ts",
  "src/lib/retry.ts",
  "src/lib/cache-policy.ts",
];

for (const file of requiredFiles) await access(file);

if (baseUrl) {
  const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`/api/health returned ${response.status}`);
  console.log(`smoke ok: ${baseUrl}/api/health`);
} else {
  console.log("smoke ok: foundational files present (set BASE_URL for a live health request)");
}
