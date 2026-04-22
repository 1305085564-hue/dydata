import test from "node:test";
import assert from "node:assert/strict";

test("dashboard 视觉样式 helper 返回统一的区块和状态 class", async () => {
  const mod = await import(new URL("./dashboard-visuals.ts", import.meta.url).href).catch(() => null);

  assert.ok(mod, "expected dashboard-visuals helper to exist");

  assert.equal(
    mod.getDashboardSurfaceClass("hero"),
    "dashboard-surface dashboard-surface-hero"
  );
  assert.equal(
    mod.getDashboardSurfaceClass("panel"),
    "dashboard-surface dashboard-surface-panel"
  );
  assert.equal(
    mod.getDashboardSurfaceClass("success"),
    "dashboard-surface dashboard-surface-success"
  );

  assert.equal(
    mod.getDashboardStatusClass("submitted"),
    "dashboard-status dashboard-status-submitted"
  );
  assert.equal(
    mod.getDashboardStatusClass("pending"),
    "dashboard-status dashboard-status-pending"
  );
  assert.equal(
    mod.getDashboardStatusClass("editing"),
    "dashboard-status dashboard-status-editing"
  );
  assert.equal(
    mod.getDashboardStatusClass("leave"),
    "dashboard-status dashboard-status-leave"
  );

  assert.equal(
    mod.getDashboardMetricGridClass("primary"),
    "dashboard-metric-grid dashboard-metric-grid-primary"
  );
  assert.equal(
    mod.getDashboardMetricGridClass("secondary"),
    "dashboard-metric-grid dashboard-metric-grid-secondary"
  );
});
