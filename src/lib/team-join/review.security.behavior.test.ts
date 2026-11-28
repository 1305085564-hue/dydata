import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("真实入团审批 SQL：跨团队、自批、归档、组员、越级和异常输入拒绝；同团队正常审批原子生效", async () => {
  const db = new PGlite();
  const actor = "123e4567-e89b-42d3-a456-426614174001";
  const applicant = "223e4567-e89b-42d3-a456-426614174002";
  const request = "323e4567-e89b-42d3-a456-426614174003";
  const ownTeam = "423e4567-e89b-42d3-a456-426614174004";
  const foreignTeam = "523e4567-e89b-42d3-a456-426614174005";
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
      create table public.profiles(id uuid primary key, role text, company_role text, team_id uuid, membership_status text);
      create table public.team_join_requests(id uuid primary key, applicant_user_id uuid, target_team_id uuid, status text, reviewed_by uuid, reviewed_at timestamptz, review_note text);
    `);
    const roles = await readFile("supabase/migrations/20260919095135_permission_v2_reconcile_compat.sql", "utf8");
    await db.exec(roles.slice(0, roles.indexOf("$$;") + 3));
    await db.exec(await readFile("supabase/migrations/20261128120000_harden_team_join_review.sql", "utf8"));
    async function seed(actorRole = "admin", actorState = "active", applicantRole = "member", applicantState = "active", targetTeam = ownTeam, applicantTeam: string | null = null, applicantId = applicant) {
      await db.exec("reset role; truncate public.team_join_requests, public.profiles;");
      await db.query("insert into public.profiles values ($1,$2,$2,$3,$4)", [actor, actorRole, ownTeam, actorState]);
      await db.query("insert into public.profiles values ($1,$2,$2,$3,$4)", [applicant, applicantRole, applicantTeam, applicantState]);
      await db.query("insert into public.team_join_requests(id,applicant_user_id,target_team_id,status) values ($1,$2,$3,'pending')", [request, applicantId, targetTeam]);
    }
    async function review(user: string | null = actor, action: string | null = "approve", note: string | null = null) {
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? ""]);
      await db.exec("set role authenticated");
      const result = await db.query<{ result: { ok: boolean; reason?: string; status?: string } }>("select public.review_team_join_request($1,$2,$3) as result", [request, action, note]);
      await db.exec("reset role");
      return result.rows[0].result;
    }
    for (const scenario of [
      () => seed("member"),
      () => seed("admin", "archived"),
      () => seed("admin", "active", "member", "archived"),
      () => seed("admin", "active", "admin"),
      () => seed("company_owner", "active", "company_owner"),
      () => seed("admin", "active", "member", "active", foreignTeam),
      () => seed("admin", "active", "member", "active", ownTeam, foreignTeam),
      () => seed("admin", "active", "member", "active", ownTeam, null, actor),
    ]) {
      await scenario();
      assert.deepEqual(await review(), { ok: false, reason: "forbidden" });
      const rows = await db.query<{ status: string }>("select status from public.team_join_requests");
      assert.equal(rows.rows[0].status, "pending");
    }
    await seed();
    assert.deepEqual(await review(null), { ok: false, reason: "unauthenticated" });
    for (const [action, note] of [[null, null], ["forged", null], ["approve", "x".repeat(201)]] as const) {
      assert.deepEqual(await review(actor, action, note), { ok: false, reason: "invalid_input" });
    }
    assert.deepEqual(await review(), { ok: true, status: "approved" });
    const joined = await db.query<{ team_id: string }>("select team_id from public.profiles where id=$1", [applicant]);
    assert.equal(joined.rows[0].team_id, ownTeam);
    assert.deepEqual(await review(), { ok: false, reason: "already_reviewed" });
    await seed("company_owner", "active", "admin");
    assert.deepEqual(await review(actor, "reject", "原因"), { ok: true, status: "rejected" });
    const rejected = await db.query<{ team_id: string | null }>("select team_id from public.profiles where id=$1", [applicant]);
    assert.equal(rejected.rows[0].team_id, null);
  } finally { await db.close(); }
});
