export default class CloudBaseGateReporter {
  onEnd(result) {
    const tests = this.suite?.allTests() ?? [];
    const counts = { discovered: tests.length, ran: 0, passed: 0, failed: 0, skipped: 0, unrun: 0 };
    for (const test of tests) {
      const status = test.results.at(-1)?.status;
      if (status && status !== "skipped") counts.ran++;
      if (status === "passed" && test.expectedStatus === "passed") counts.passed++;
      else if (status === "skipped" || test.expectedStatus === "skipped") counts.skipped++;
      else if (!status) counts.unrun++;
      else counts.failed++;
    }
    console.log(`[gate-cloudbase] ${JSON.stringify(counts)}`);
    if (!counts.discovered || counts.skipped || counts.unrun || counts.failed) return { status: "failed" };
    return { status: result.status };
  }
  onBegin(_config, suite) { this.suite = suite; }
}
