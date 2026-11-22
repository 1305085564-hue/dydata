import test from "node:test";
import assert from "node:assert/strict";

import { syncAuthUserTeamMetadata } from "./member-lifecycle-service";

type AuthMetadataClient = Parameters<typeof syncAuthUserTeamMetadata>[0];

function createClient() {
  const updates: unknown[] = [];
  const client = {
    auth: {
      admin: {
        async updateUserById(_userId: string, attributes: unknown) {
          updates.push(attributes);
          return { error: null };
        },
      },
    },
  } as unknown as AuthMetadataClient;
  return { client, updates };
}

test("CloudBase metadata sync is a no-op and does not call Auth admin API", async () => {
  const { client, updates } = createClient();
  const error = await syncAuthUserTeamMetadata(client, "member-1", {
    teamId: "team-2",
    teamName: "内容二部",
    metadata: { display_name: "成员" },
  });
  assert.equal(error, null);
  assert.deepEqual(updates, []);
});
