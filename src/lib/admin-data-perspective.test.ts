import assert from "node:assert/strict";
import test from "node:test";

import { resolveAdminDataPerspective } from "./admin-data-perspective";

test("owner 默认公司视角，切团队时会落到有效 teamId", () => {
  assert.deepEqual(
    resolveAdminDataPerspective({
      requestedPerspective: "company",
      requestedTeamId: null,
      canUseCompanyPerspective: true,
      availableTeamIds: ["team-1", "team-2"],
      fallbackTeamId: "team-2",
    }),
    { perspective: "company", teamId: null },
  );

  assert.deepEqual(
    resolveAdminDataPerspective({
      requestedPerspective: "team",
      requestedTeamId: "team-1",
      canUseCompanyPerspective: true,
      availableTeamIds: ["team-1", "team-2"],
      fallbackTeamId: "team-2",
    }),
    { perspective: "team", teamId: "team-1" },
  );

  assert.deepEqual(
    resolveAdminDataPerspective({
      requestedPerspective: "team",
      requestedTeamId: "missing",
      canUseCompanyPerspective: true,
      availableTeamIds: ["team-1", "team-2"],
      fallbackTeamId: "team-2",
    }),
    { perspective: "team", teamId: "team-2" },
  );
});

test("非 owner 固定团队视角，不接受公司视角扩权", () => {
  assert.deepEqual(
    resolveAdminDataPerspective({
      requestedPerspective: "company",
      requestedTeamId: "team-2",
      canUseCompanyPerspective: false,
      availableTeamIds: ["team-1", "team-2"],
      fallbackTeamId: "team-1",
    }),
    { perspective: "team", teamId: "team-1" },
  );
});
