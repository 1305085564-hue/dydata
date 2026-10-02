import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

const port = process.env.PORT || "3100";
const logPath = process.env.DYDATA_ROLE_GATE_LOG_FILE || resolve(process.cwd(), "output/审批九类/服务端.log");
mkdirSync(dirname(logPath), { recursive: true });
const log = createWriteStream(logPath, { flags: "w" });
const nextBin = resolve(process.cwd(), "node_modules/next/dist/bin/next");
const child = spawn(process.env.NODE_BINARY || "node", [nextBin, "start", "-p", port], {
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});

function forward(stream, output) {
  stream.on("data", (chunk) => {
    log.write(chunk);
    output.write(chunk);
  });
}

forward(child.stdout, process.stdout);
forward(child.stderr, process.stderr);

const stop = (signal) => {
  if (!child.killed) child.kill(signal);
};
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
child.on("exit", (code, signal) => {
  log.end();
  process.exit(code ?? (signal ? 1 : 0));
});
