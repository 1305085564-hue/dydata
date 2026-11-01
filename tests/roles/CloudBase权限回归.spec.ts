import { test, expect, request as requests, type APIRequestContext } from '@playwright/test';
type PermissionFixtures = typeof import('../../scripts/cloudbase/permission-fixtures.mjs');
let readManifest: PermissionFixtures['readManifest'];
let execute: PermissionFixtures['execute'];
let quote: PermissionFixtures['quote'];
let uuid: PermissionFixtures['uuid'];
let gateway: string;

// Keep the fixture CLI in native ESM: static imports from this CommonJS-loaded
// spec pass through Playwright's CJS hook, which cannot execute import.meta.
test.beforeAll(async () => {
  const fixtures = await import('../../scripts/cloudbase/permission-fixtures.mjs');
  ({ readManifest, execute, quote, uuid } = fixtures);
  gateway = `https://${fixtures.ENV_ID}.api.tcloudbasegateway.com`;
});

// All mutations are restricted to the synthetic namespace owned by this gate.
const identities = () => readManifest().users as Record<string, { id: string; username: string; password: string }>;
async function token(key: string) {
  const user = identities()[key];
  const r = await fetch(`${gateway}/auth/v1/signin`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({username:user.username,password:user.password}) });
  expect(r.status, 'synthetic login').toBe(200);
  const body = await r.json();
  const value = body.token ?? body;
  expect(typeof value.access_token).toBe('string');
  return value.access_token as string;
}
async function rest(jwt: string, path: string, method = 'GET', body?: unknown) {
  return fetch(`${gateway}/v1/rdb/rest/${path}`, {method, headers:{authorization:`Bearer ${jwt}`,'content-type':'application/json',prefer:'return=representation'}, ...(body === undefined ? {} : {body:JSON.stringify(body)})});
}
async function site(key: string): Promise<APIRequestContext> {
  const ctx = await requests.newContext({baseURL:'http://127.0.0.1:3100'});
  const u = identities()[key];
  const r = await ctx.post('/api/cloudbase/auth/signin',{data:{username:u.username,password:u.password}});
  expect(r.status(), 'site synthetic login').toBe(200);
  const state=await ctx.storageState();
  const authCookie=state.cookies.find(c=>c.name==='dydata-cloudbase-session');
  expect(Boolean(authCookie?.httpOnly && authCookie?.secure),'server issues Secure HttpOnly cookie').toBe(true);
  await ctx.dispose();
  // This gate owns a plain HTTP loopback server. Only the synthetic client jar
  // transports its Secure cookie locally; the server's actual cookie flags stay asserted.
  return requests.newContext({baseURL:'http://127.0.0.1:3100',storageState:{...state,cookies:state.cookies.map(c=>({...c,secure:false}))}});
}
async function rows(sql: string) { return (await execute(sql)).rows; }
async function archivedFixture(id: string, archived: boolean) {
  expect(id.startsWith('f0cba501-2026-4111-a001-')).toBe(true);
  // Fixture setup uses the existing trusted lifecycle role; acceptance below
  // still uses genuine ordinary-user JWTs, never ExecutePGSql's Role option.
  const r=await fetch(`${gateway}/v1/rdb/rest/profiles?id=eq.${id}`,{method:'PATCH',headers:{authorization:`Bearer ${process.env.CLOUDBASE_SERVICE_API_KEY}`,'content-type':'application/json',prefer:'return=representation'},body:JSON.stringify({membership_status:archived?'archived':'active'})});
  expect(r.status).toBe(200);expect((await r.json()).length).toBe(1);
}
async function resetReview() { await execute(`UPDATE public.videos SET review_status='pending',reviewed_by=NULL,reviewed_at=NULL,topic_id=NULL WHERE id=${quote(uuid(301))}`); }

test('environment and role identities are isolated', async()=> {
  for (const role of ['memberA','adminA','ownerA']) {
    const t=await token(role);
    const r=await rest(t,`profiles?id=eq.${identities()[role].id}&select=id`);
    expect(r.status).toBe(200); expect((await r.json()).length).toBe(1);
  }
});
for (const [key,state] of [['blocked',3],['pending',2],['archived',1]] as const) {
  test(`R01/R09 ${key} old JWT and Cookie lose access`, async()=> {
    const t=await token(key); const ctx=await site(key); const id=identities()[key].id;
    try {
      await execute(`UPDATE auth.users SET status=${state} WHERE sub=${quote(id)}`);
      if(key==='archived')await archivedFixture(id,true);
      const r=await rest(t,`profiles?id=eq.${id}&select=id`);
      const body=await r.json();
      expect(r.status >= 400 || (Array.isArray(body)&&body.length===0), 'inactive gateway read denied').toBe(true);
      const page=await ctx.get('/api/admin/content/list?page=1&pageSize=1');
      expect([401,403], 'inactive API must be a denial, not 503').toContain(page.status());
    } finally {
      await execute(`UPDATE auth.users SET status=1 WHERE sub=${quote(id)}`);
      if(key==='archived')await archivedFixture(id,false);
      await ctx.dispose();
    }
  });
}
test('R02 logout invalidates the old gateway token', async()=> {
  const ctx=await site('memberA');
  try {
    // Login through the same server context; the raw credential is never emitted by assertions.
    const state=await ctx.storageState();
    const cookie=state.cookies.find(c=>c.name==='dydata-cloudbase-session');
    expect(Boolean(cookie)).toBe(true);
    // Next's Set-Cookie encoder wraps the session serializer's URI encoding.
    const session=JSON.parse(decodeURIComponent(decodeURIComponent(cookie!.value))) as {accessToken:string};
    expect(typeof session.accessToken,'valid synthetic session cookie').toBe('string');
    expect((await ctx.post('/api/cloudbase/auth/signout',{data:{}})).status()).toBe(200);
    expect((await ctx.get('/api/cloudbase/auth/user')).status()).toBe(401);
    const r=await rest(session.accessToken,`profiles?id=eq.${identities().memberA.id}&select=id`);
    const data=await r.json();
    expect(r.status>=400 || (Array.isArray(data)&&data.length===0),'old gateway credential denied after logout').toBe(true);
  } finally {await ctx.dispose();}
});
for (const [table,id] of [['fulfillment_appeals',602],['content_observations',702],['sample_quality_issues',902]] as const) {
  test(`R03 ${table} cross-team reads and writes denied`, async()=> {
    const t=await token('adminA');
    const r=await rest(t,`${table}?id=eq.${uuid(id)}&select=id`);
    expect(r.status).toBe(200); expect((await r.json()).length).toBe(0);
    const field=table==='fulfillment_appeals'?'reason':table==='sample_quality_issues'?'severity':'note';
    const next=table==='sample_quality_issues'?'critical':'forbidden-fixture-change';
    const w=await rest(t,`${table}?id=eq.${uuid(id)}`,'PATCH',{[field]:next});
    const actual=await rows(`SELECT ${field} AS value FROM public.${table} WHERE id=${quote(uuid(id))}`);
    expect(actual[0].value===next).toBe(false);
    expect(w.status>=400 || (await w.json()).length===0).toBe(true);
  });
}
test('R04 employees cannot change review decision fields', async()=> {
  await resetReview();
  try {
    const r=await rest(await token('memberA'),`videos?id=eq.${uuid(301)}`,'PATCH',{review_status:'reviewed',reviewed_by:identities().adminA.id,reviewed_at:new Date().toISOString()});
    expect(r.status>=400,'review decision write rejected').toBe(true);
    expect((await rows(`SELECT review_status FROM public.videos WHERE id=${quote(uuid(301))}`))[0].review_status).toBe('pending');
  } finally {await resetReview();}
});
test('R04 employee normal edit and administrator review still work', async()=> {
  try {
    const own=await rest(await token('memberA'),`videos?id=eq.${uuid(301)}`,'PATCH',{video_title:'dydata-permission-v2-edited'});
    expect(own.status).toBe(200);
    const admin=await site('adminA');
    try { expect((await admin.patch(`/api/admin/content/${uuid(301)}/review-status`,{data:{status:'reviewed'}})).status()).toBe(200); }
    finally {await admin.dispose();}
  } finally {await resetReview();}
});
test('R05 employee cannot link own video to another team topic', async()=> {
  await resetReview();
  try {
    const r=await rest(await token('memberA'),`videos?id=eq.${uuid(301)}`,'PATCH',{topic_id:uuid(402)});
    expect(r.status>=400,'foreign topic association rejected').toBe(true);
    expect((await rows(`SELECT topic_id FROM public.videos WHERE id=${quote(uuid(301))}`))[0].topic_id).toBeNull();
  } finally {await resetReview();}
});
for (const action of ['claim','start-scripting']) {
  test(`R06 ${action} denies other-team topic and permits own-team multiwriter`, async()=> {
    const ctx=await site('memberA');
    try {
      const r=await ctx.post(`/api/topics/sub-topics/${uuid(402)}/${action}`,{data:{}});
      expect([403,404]).toContain(r.status());
      expect(Number((await rows(`SELECT count(*) AS count FROM public.sub_topic_claims WHERE sub_topic_id=${quote(uuid(402))} AND user_id=${quote(identities().memberA.id)}`))[0].count)).toBe(0);
      for(let i=0;i<2;i++) expect((await ctx.post(`/api/topics/sub-topics/${uuid(401)}/${action}`,{data:{}})).status()).toBe(200);
      expect(Number((await rows(`SELECT count(*) AS count FROM public.sub_topic_claims WHERE sub_topic_id=${quote(uuid(401))} AND user_id=${quote(identities().memberA.id)} AND status='writing'`))[0].count)).toBe(1);
    } finally {await ctx.dispose(); await execute(`DELETE FROM public.sub_topic_claims WHERE user_id IN (${quote(identities().memberA.id)},${quote(identities().adminA.id)})`);}
  });
}
test('R07 notification read reports ownership correctly and is idempotent', async()=> {
  const ctx=await site('memberA');
  try {
    expect([403,404]).toContain((await ctx.patch(`/api/notifications/${uuid(502)}/read`,{data:{}})).status());
    expect((await rows(`SELECT status FROM public.notifications WHERE id=${quote(uuid(502))}`))[0].status).toBe('unread');
    for(let i=0;i<2;i++) expect((await ctx.patch(`/api/notifications/${uuid(501)}/read`,{data:{}})).status()).toBe(200);
  } finally {await ctx.dispose();}
});
test('R10 employee can query readable video topic status through GET and POST', async()=> {
  const ctx=await site('memberA');
  try {
    expect((await ctx.get(`/api/admin/content/topic-library-status?videoIds=${uuid(301)}`)).status()).toBe(200);
    expect((await ctx.post('/api/admin/content/topic-library-status',{data:{videoIds:[uuid(301),uuid(302)]}})).status()).toBe(200);
  } finally {await ctx.dispose();}
});
test('R08 cross-team exemption approval returns permission denial and leaves dates intact', async()=> {
  const ctx=await site('adminA');
  try {
    const r=await ctx.post('/api/exemptions/review',{data:{request_id:uuid(1002),action:'approved'}});
    expect(r.status()).toBe(403);
    expect((await rows(`SELECT request_status FROM public.exemption_request WHERE id=${quote(uuid(1002))}`))[0].request_status).toBe('pending');
    expect((await rows(`SELECT status FROM public.exemption_request_date WHERE id=${quote(uuid(1102))}`))[0].status).toBe('pending');
  } finally {await ctx.dispose();}
});
test('R11 RPC refuses a forged handler and cross-team approval', async()=> {
  const t=await token('adminA');
  for(const [id,handler] of [[602,identities().adminA.id],[601,identities().ownerA.id]] as const) {
    const r=await rest(t,'rpc/handle_fulfillment_appeal','POST',{p_appeal_id:uuid(id),p_decision:'approve',p_handler_id:handler,p_reason:'fixture'});
    expect(r.status>=400,'approval boundary enforced').toBe(true);
    expect((await rows(`SELECT status FROM public.fulfillment_appeals WHERE id=${quote(uuid(id))}`))[0].status).toBe('pending');
  }
});
test('R12 obsolete exemption RPCs are not callable with employee JWT', async()=> {
  const t=await token('adminA');
  for(const [name,args] of [
    ['review_exemption_request_atomically',{p_request_id:uuid(1002),p_decision:'approve'}],
    ['review_exemption_request_atomically_v2',{p_request_id:uuid(1002),p_decision:'approve',p_group_mode_token_hash:null}],
    ['re_review_exemption_request_atomically',{p_request_id:uuid(1002),p_decision:'approve',p_group_mode_token_hash:null}],
  ] as const) {
    const r=await rest(t,`rpc/${name}`,'POST',args);
    expect([401,403], 'obsolete entry must not execute').toContain(r.status);
  }
});
for (const [table,id] of [['fulfillment_appeals',601],['content_observations',701],['sample_quality_issues',901]] as const) {
  test(`R03 ${table} same-team management read remains available`, async()=> {
    for (const role of ['adminA','ownerA']) {
      const r=await rest(await token(role),`${table}?id=eq.${uuid(id)}&select=id`);
      expect(r.status).toBe(200);
      expect((await r.json()).map((row:{id:string})=>row.id)).toEqual([uuid(id)]);
    }
  });
}
test('R04 forged review INSERT fails while an ordinary submission succeeds', async()=> {
  const jwt=await token('memberA'); const id=uuid(303);
  const base={id,user_id:identities().memberA.id,account_id:uuid(201),video_title:'permission-v2-insert'};
  try {
    const forged=await rest(jwt,'videos','POST',{...base,review_status:'reviewed',reviewed_by:identities().adminA.id,reviewed_at:new Date().toISOString()});
    expect(forged.status>=400).toBe(true);
    expect((await rows(`SELECT id FROM public.videos WHERE id=${quote(id)}`)).length).toBe(0);
    expect((await rest(jwt,'videos','POST',base)).status).toBeLessThan(300);
    expect((await rows(`SELECT review_status FROM public.videos WHERE id=${quote(id)}`))[0].review_status).toBe('pending');
  } finally {await execute(`DELETE FROM public.videos WHERE id=${quote(id)} AND user_id=${quote(identities().memberA.id)}`);}
});
test('R11 direct approval is denied; legitimate approval and reopen preserve actor and audit', async()=> {
  const jwt=await token('adminA');const admin=identities().adminA.id;
  try {
    const forged=await rest(jwt,`fulfillment_appeals?id=eq.${uuid(601)}`,'PATCH',{status:'approved',handler_id:admin,handled_at:new Date().toISOString()});
    expect(forged.status>=400).toBe(true);
    expect((await rows(`SELECT status FROM public.fulfillment_appeals WHERE id=${quote(uuid(601))}`))[0].status).toBe('pending');
    expect((await rest(jwt,'rpc/handle_fulfillment_appeal','POST',{p_appeal_id:uuid(601),p_decision:'approve',p_handler_id:admin,p_reason:null})).status).toBe(200);
    const approved=(await rows(`SELECT status,handler_id FROM public.fulfillment_appeals WHERE id=${quote(uuid(601))}`))[0];
    expect(approved.status).toBe('approved');expect(approved.handler_id).toBe(admin);
    expect((await rest(jwt,'rpc/reopen_fulfillment_appeal_atomically','POST',{p_appeal_id:uuid(601),p_handler_id:admin})).status).toBe(200);
    const reopened=(await rows(`SELECT status,handler_id FROM public.fulfillment_appeals WHERE id=${quote(uuid(601))}`))[0];
    expect(reopened.status).toBe('pending');expect(reopened.handler_id).toBeNull();
    const audit=await rows(`SELECT action FROM public.audit_logs WHERE user_id=${quote(admin)} AND detail::jsonb->>'appeal_id'=${quote(uuid(601))} AND action IN ('handle_fulfillment_appeal','reopen_fulfillment_appeal')`);
    expect(new Set(audit.map((row:{action:string})=>row.action))).toEqual(new Set(['handle_fulfillment_appeal','reopen_fulfillment_appeal']));
  } finally {await execute(`UPDATE public.fulfillment_appeals SET status='pending',handler_id=NULL,handled_at=NULL,decision_reason=NULL WHERE id=${quote(uuid(601))}`);}
});
test('R01 view gate preserves active access and rejects a blocked old JWT', async()=> {
  const jwt=await token('blocked');const id=identities().blocked.id;
  const active=await rest(jwt,'ai_unified_config_view?limit=1');expect(active.status).toBe(200);
  const before=await active.json();expect(Array.isArray(before)&&before.length>0).toBe(true);
  try {
    await execute(`UPDATE auth.users SET status=3 WHERE sub=${quote(id)}`);
    const denied=await rest(jwt,'ai_unified_config_view?limit=1');const body=await denied.json();
    expect(denied.status>=400||(Array.isArray(body)&&body.length===0)).toBe(true);
    for(const name of ['pg_stat_statements','pg_stat_statements_info']) {
      const stats=await rest(jwt,`${name}?limit=1`);expect([401,403]).toContain(stats.status);
    }
  } finally {await execute(`UPDATE auth.users SET status=1 WHERE sub=${quote(id)}`);}
});
test('@browser D01/B04 real private screenshot requires exact video context and an active session', async()=> {
  // Read an existing reference and object only. No historical row or COS object is changed.
  const candidate=await rows(`SELECT v.id, coalesce(nullif(s.curve_screenshot_url,''),s.screenshot_urls[1]) AS url FROM public.videos v JOIN public.profiles p ON p.id=v.user_id JOIN auth.users u ON u.sub=p.id::text JOIN LATERAL (SELECT * FROM public.video_metrics_snapshots s WHERE s.video_id=v.id AND s.snapshot_type='24h' ORDER BY s.captured_at DESC LIMIT 1) s ON true WHERE v.lifecycle_state='active' AND p.team_id IS NOT NULL AND p.membership_status='active' AND u.status=1 AND coalesce(nullif(s.curve_screenshot_url,''),s.screenshot_urls[1]) LIKE '%/api/submission-screenshots/file?%' ORDER BY v.id LIMIT 1`);
  expect(candidate.length,'existing private screenshot reference required').toBe(1);
  const stored=new URL(candidate[0].url,'https://dydata.local');const path=stored.searchParams.get('path');
  expect(Boolean(path)).toBe(true);
  const bare=`/api/submission-screenshots/file?path=${encodeURIComponent(path!)}`;
  const bound=`${bare}&videoId=${candidate[0].id}`;
  const ctx=await site('memberA');const anon=await requests.newContext({baseURL:'http://127.0.0.1:3100'});
  try {
    expect((await anon.get(bound)).status()).toBe(401);
    expect((await ctx.get(bare)).status()).toBe(403);
    expect((await ctx.get(`${bare}&videoId=${uuid(301)}`)).status()).toBe(403);
    const image=await ctx.get(bound);
    expect(image.status()).toBe(200);expect(image.headers()['content-type']).toMatch(/^image\//);
    expect(image.headers()['x-screenshot-backend']).toBe('cos');expect((await image.body()).byteLength).toBeGreaterThan(0);
    expect((await ctx.post('/api/submission-screenshots/grant',{data:{}})).status()).toBe(200);
    expect((await ctx.get(bound)).status()).toBe(200);
    await execute(`UPDATE auth.users SET status=3 WHERE sub=${quote(identities().memberA.id)}`);
    expect([401,403]).toContain((await ctx.get(bound)).status());
  } finally {
    await execute(`UPDATE auth.users SET status=1 WHERE sub=${quote(identities().memberA.id)}`);
    await ctx.dispose();await anon.dispose();
  }
});
test('@browser role pages retain access rules and never request Supabase', async({browser})=> {
  for(const role of ['memberA','adminA','ownerA']) {
    const ctx=await site(role);
    const context=await browser.newContext({storageState:await ctx.storageState()});
    const page=await context.newPage(); const forbidden:string[]=[];
    page.on('request',r=>{if(/\.supabase\.(co|com)(\/|:)/.test(r.url()))forbidden.push('supabase');});
    try {
      for(const path of ['/admin/content','/admin/modules','/admin/pulse']) {
        const r=await page.goto(`http://127.0.0.1:3100${path}`);
        expect(r?.status()).toBeLessThan(500);
        expect(page.url().includes('/login')).toBe(false);
      }
      expect(forbidden.length).toBe(0);
    } finally {await context.close();await ctx.dispose();}
  }
});
for(const role of ['memberA','adminA','ownerA']) {
  test(`R01 ${role} blocked old JWT cannot read any of the 89 client tables`, async()=> {
    const jwt=await token(role);const id=identities()[role].id;
    const tables=await rows(`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND has_table_privilege('authenticated',c.oid,'SELECT') ORDER BY c.relname`);
    expect(tables.length).toBe(89);
    try {
      await execute(`UPDATE auth.users SET status=3 WHERE sub=${quote(id)}`);
      for(let i=0;i<tables.length;i+=8) await Promise.all(tables.slice(i,i+8).map(async(table:{name:string})=>{
        const r=await rest(jwt,`${table.name}?limit=1`);
        if(r.status===200)expect((await r.json()).length,`${table.name}: blocked identity must read zero rows`).toBe(0);
        else expect([401,403],`${table.name}: explicit permission denial required`).toContain(r.status);
      }));
      const rpc=await rest(jwt,'rpc/visible_user_ids','POST',{});
      expect([401,403]).toContain(rpc.status);
    } finally {await execute(`UPDATE auth.users SET status=1 WHERE sub=${quote(id)}`);}
  });
}
test('@browser B01 owner archives and restores a synthetic member through member management', async({browser})=> {
  const target=identities().archived;const oldJwt=await token('archived');const oldSite=await site('archived');
  const ctx=await site('ownerA');const context=await browser.newContext({storageState:await ctx.storageState()});const page=await context.newPage();
  try {
    await page.goto(`http://127.0.0.1:3100/admin/modules?team=${uuid(101)}&member=${target.id}`);
    await page.getByRole('button',{name:/归档账号/}).click();
    await page.getByPlaceholder('必填，例如：离职、转岗、实习结束').fill('permission-v2 synthetic archive acceptance');
    await page.getByRole('button',{name:'确认归档',exact:true}).click();
    await expect.poll(async()=> (await rows(`SELECT membership_status FROM public.profiles WHERE id=${quote(target.id)}`))[0].membership_status).toBe('archived');
    const archived=(await rows(`SELECT p.team_id,p.archive_snapshot->>'team_id' AS previous_team,u.status FROM public.profiles p JOIN auth.users u ON u.sub=p.id::text WHERE p.id=${quote(target.id)}`))[0];
    expect(archived.team_id).toBeNull();expect(archived.previous_team).toBe(uuid(101));expect(Number(archived.status)).toBe(3);
    expect([401,403]).toContain((await oldSite.get('/api/admin/content/list?page=1&pageSize=1')).status());
    const oldRead=await rest(oldJwt,`profiles?id=eq.${target.id}&select=id`);
    expect(oldRead.status>=400||(await oldRead.json()).length===0).toBe(true);
    await page.goto(`http://127.0.0.1:3100/admin/modules?view=archived&team=${uuid(101)}&q=${encodeURIComponent('dydata-permission-v2-'+target.username.split('@')[0])}`);
    await page.locator('button[title="恢复账号"]').click();
    await page.getByRole('button',{name:'确认恢复',exact:true}).click();
    await expect.poll(async()=> (await rows(`SELECT membership_status FROM public.profiles WHERE id=${quote(target.id)}`))[0].membership_status).toBe('active');
    const restored=(await rows(`SELECT p.team_id,p.company_role,u.status FROM public.profiles p JOIN auth.users u ON u.sub=p.id::text WHERE p.id=${quote(target.id)}`))[0];
    expect(restored.team_id).toBeNull();expect(restored.company_role).toBe('member');expect(Number(restored.status)).toBe(1);
    expect(typeof await token('archived')).toBe('string');
    const logs=await rows(`SELECT action_type FROM public.member_change_log WHERE profile_id=${quote(target.id)}`);
    expect(new Set(logs.map((row:{action_type:string})=>row.action_type))).toEqual(new Set(['archive','restore']));
  } finally {await context.close();await ctx.dispose();await oldSite.dispose();}
});
