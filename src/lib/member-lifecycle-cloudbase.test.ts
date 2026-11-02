import test from "node:test";
import assert from "node:assert/strict";

import { syncAuthUserTeamMetadata } from "./member-lifecycle-service";

type AuthMetadataClient = Parameters<typeof syncAuthUserTeamMetadata>[0];

async function withBackend(backend: string, run: () => Promise<void>) {
  const previous = [process.env.DYDATA_BACKEND, process.env.NEXT_PUBLIC_DYDATA_BACKEND];
  process.env.DYDATA_BACKEND = backend;
  process.env.NEXT_PUBLIC_DYDATA_BACKEND = backend;
  try {
    await run();
  } finally {
    if (previous[0] === undefined) delete process.env.DYDATA_BACKEND;
    else process.env.DYDATA_BACKEND = previous[0];
    if (previous[1] === undefined) delete process.env.NEXT_PUBLIC_DYDATA_BACKEND;
    else process.env.NEXT_PUBLIC_DYDATA_BACKEND = previous[1];
  }
}

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

test("CloudBase metadata sync does not call the Supabase Auth admin API", async () => {
  await withBackend("cloudbase", async () => {
    const { client, updates } = createClient();
    const error = await syncAuthUserTeamMetadata(client, "member-1", {
      teamId: "team-2",
      teamName: "内容二部",
      metadata: { display_name: "成员" },
    });
    assert.equal(error, null);
    assert.deepEqual(updates, []);
  });
});

test("Supabase metadata sync preserves existing fields and updates team metadata", async () => {
  await withBackend("supabase", async () => {
    const { client, updates } = createClient();
    const error = await syncAuthUserTeamMetadata(client, "member-1", {
      teamId: "team-2",
      teamName: "内容二部",
      metadata: { display_name: "成员", locale: "zh-CN" },
    });
    assert.equal(error, null);
    assert.deepEqual(updates, [{
      user_metadata: {
        display_name: "成员",
        locale: "zh-CN",
        team_id: "team-2",
        team_name: "内容二部",
      },
    }]);
  });
});
