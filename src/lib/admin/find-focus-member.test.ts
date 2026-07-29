import test from "node:test";
import assert from "node:assert/strict";

import { findFocusMember } from "./find-focus-member";

test("findFocusMember locates the profile matching focusMemberId", () => {
  const profiles = [{ id: "u1" }, { id: "u2" }];
  const result = findFocusMember(profiles, "u2");
  assert.equal(result, profiles[1]);
});

test("findFocusMember returns null when no profile matches", () => {
  const profiles = [{ id: "u1" }];
  const result = findFocusMember(profiles, "missing");
  assert.equal(result, null);
});

test("findFocusMember returns null when focusMemberId is undefined or empty", () => {
  const profiles = [{ id: "u1" }];
  assert.equal(findFocusMember(profiles, undefined), null);
  assert.equal(findFocusMember(profiles, null), null);
  assert.equal(findFocusMember(profiles, ""), null);
});
