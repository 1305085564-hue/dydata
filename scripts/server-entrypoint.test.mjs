import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ENTRYPOINT = fileURLToPath(new URL("./server-entrypoint.mjs", import.meta.url));

async function waitForJson(file, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await delay(10);
    }
  }
  throw new Error(`Timed out waiting for ${file}`);
}

function waitForClose(child, timeoutMs = 3_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Timed out waiting for entrypoint to exit"));
    }, timeoutMs);
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function makeServerChild(directory) {
  const readyFile = path.join(directory, "ready.json");
  const signalFile = path.join(directory, "signal.json");
  const childScript = path.join(directory, "child.mjs");
  await writeFile(childScript, `
    import { createServer } from "node:http";
    import { writeFileSync } from "node:fs";
    const [readyFile, signalFile] = process.argv.slice(2);
    const server = createServer((_request, response) => response.end("still-serving"));
    server.listen(0, "127.0.0.1", () => writeFileSync(readyFile, JSON.stringify({ port: server.address().port, pid: process.pid })));
    for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => {
      writeFileSync(signalFile, JSON.stringify({ signal, at: Date.now() }));
      server.close(() => process.exit(0));
    });
  `);
  return { readyFile, signalFile, childScript };
}

function startEntrypoint(drainMs, childScript, readyFile, signalFile) {
  return spawn(process.execPath, [
    ENTRYPOINT,
    `--drain-ms=${drainMs}`,
    "--",
    process.execPath,
    childScript,
    readyFile,
    signalFile,
  ], { stdio: ["ignore", "ignore", "pipe"] });
}

async function createFixture(t, drainMs) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dydata-entrypoint-test-"));
  const files = await makeServerChild(directory);
  const entrypoint = startEntrypoint(drainMs, files.childScript, files.readyFile, files.signalFile);
  const ready = await waitForJson(files.readyFile);
  t.after(async () => {
    try { process.kill(ready.pid, "SIGKILL"); } catch { /* child already exited */ }
    try { entrypoint.kill("SIGKILL"); } catch { /* entrypoint already exited */ }
    await rm(directory, { recursive: true, force: true });
  });
  return { ...files, entrypoint, ready };
}

test("SIGTERM keeps serving throughout the drain window, then forwards SIGTERM", async (t) => {
  const drainMs = 500;
  const { entrypoint, ready, signalFile } = await createFixture(t, drainMs);
  const closed = waitForClose(entrypoint);
  const startedAt = Date.now();

  entrypoint.kill("SIGTERM");
  await delay(120);
  await assert.rejects(() => readFile(signalFile), { code: "ENOENT" });
  const response = await fetch(`http://127.0.0.1:${ready.port}/health`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "still-serving");

  const result = await closed;
  const forwarded = await waitForJson(signalFile);
  assert.equal(forwarded.signal, "SIGTERM");
  assert.ok(forwarded.at - startedAt >= drainMs - 30, `forwarded after ${forwarded.at - startedAt}ms`);
  assert.deepEqual(result, { code: 0, signal: null });
});

test("repeated SIGTERM neither exits early nor restarts the drain timer", async (t) => {
  const drainMs = 600;
  const { entrypoint, signalFile } = await createFixture(t, drainMs);
  const closed = waitForClose(entrypoint);
  const startedAt = Date.now();

  entrypoint.kill("SIGTERM");
  await delay(100);
  entrypoint.kill("SIGTERM");
  await delay(180);
  entrypoint.kill("SIGTERM");
  await delay(180);
  await assert.rejects(() => readFile(signalFile), { code: "ENOENT" });

  const result = await closed;
  const forwarded = await waitForJson(signalFile);
  const elapsed = forwarded.at - startedAt;
  assert.equal(forwarded.signal, "SIGTERM");
  assert.ok(elapsed >= drainMs - 30, `forwarded too early after ${elapsed}ms`);
  assert.ok(elapsed < drainMs + 220, `repeated SIGTERM extended drain to ${elapsed}ms`);
  assert.deepEqual(result, { code: 0, signal: null });
});

test("SIGINT cancels the drain and is forwarded immediately", async (t) => {
  const { entrypoint, signalFile } = await createFixture(t, 5_000);
  const closed = waitForClose(entrypoint);

  entrypoint.kill("SIGTERM");
  await delay(80);
  const startedAt = Date.now();
  entrypoint.kill("SIGINT");

  const result = await closed;
  const forwarded = await waitForJson(signalFile);
  assert.equal(forwarded.signal, "SIGINT");
  assert.ok(forwarded.at - startedAt < 1_000, `SIGINT forwarding took ${forwarded.at - startedAt}ms`);
  assert.deepEqual(result, { code: 0, signal: null });
});

test("an early child exit clears the drain timer and preserves its exit code", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dydata-entrypoint-exit-test-"));
  const readyFile = path.join(directory, "ready");
  const signalFile = path.join(directory, "signal");
  const childScript = path.join(directory, "child.mjs");
  await writeFile(childScript, `
    import { writeFileSync } from "node:fs";
    const [readyFile] = process.argv.slice(2);
    writeFileSync(readyFile, JSON.stringify({ pid: process.pid }));
    setTimeout(() => process.exit(23), 100);
  `);
  const entrypoint = startEntrypoint(1_500, childScript, readyFile, signalFile);
  const ready = await waitForJson(readyFile);
  t.after(async () => {
    try { process.kill(ready.pid, "SIGKILL"); } catch { /* child already exited */ }
    try { entrypoint.kill("SIGKILL"); } catch { /* entrypoint already exited */ }
    await rm(directory, { recursive: true, force: true });
  });
  const closed = waitForClose(entrypoint);
  const startedAt = Date.now();
  entrypoint.kill("SIGTERM");

  const result = await closed;
  assert.equal(result.code, 23);
  assert.equal(result.signal, null);
  assert.ok(Date.now() - startedAt < 1_000, "entrypoint waited for the drain timer after child exit");
});

test("invalid --drain-ms fails quickly without starting a child", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dydata-entrypoint-invalid-test-"));
  const childScript = path.join(directory, "must-not-start.mjs");
  const marker = path.join(directory, "started");
  await writeFile(childScript, `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(marker)}, "started");`);
  const startedAt = Date.now();
  const child = spawn(process.execPath, [ENTRYPOINT, "--drain-ms=-1", "--", process.execPath, childScript], { stdio: ["ignore", "ignore", "pipe"] });
  t.after(async () => { try { child.kill("SIGKILL"); } catch { /* process already exited */ } await rm(directory, { recursive: true, force: true }); });
  const result = await waitForClose(child);
  assert.notEqual(result.code, 0);
  assert.ok(Date.now() - startedAt < 1_000, "invalid drain duration did not fail quickly");
  await assert.rejects(() => readFile(marker), { code: "ENOENT" });
});
