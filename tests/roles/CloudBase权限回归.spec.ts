import { test, expect, request as requests, type APIRequestContext } from '@playwright/test';
import { readManifest, execute, quote, uuid, ENV_ID } from '../../scripts/cloudbase/permission-fixtures.mjs';

// All mutations are restricted to the synthetic namespace owned by this gate.
const gateway = `https://${ENV_ID}.api.tcloudbasegateway.com`;
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
async function site(key: string) {
  const ctx = await requests.newContext({baseURL:'http://127.0.0.1:3100'});
  const u = identities()[key];
  const r = await ctx.post('/api/cloudbase/auth/signin',{data:{username:u.username,password:u.password}});
  expect(r.status(), 'site synthetic login').toBe(200);
  return ctx;
}
async function rows(sql: string) { return (await execute(sql)).rows; }
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
      await execute(`UPDATE auth.users SET status=${state} WHERE sub=${quote(id)}; UPDATE public.profiles SET membership_status=${quote(key==='archived'?'archived':'active')} WHERE id=${quote(id)}`);
      const r=await rest(t,`profiles?id=eq.${id}&select=id`);
      const body=await r.json();
      expect(r.status >= 400 || (Array.isArray(body)&&body.length===0), 'inactive gateway read denied').toBe(true);
      const page=await ctx.get('/api/admin/content/list?page=1&pageSize=1');
      expect([401,403], 'inactive API must be a denial, not 503').toContain(page.status());
    } finally {
      await execute(`UPDATE auth.users SET status=1 WHERE sub=${quote(id)}; UPDATE public.profiles SET membership_status='active' WHERE id=${quote(id)}`); await ctx.dispose();
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
    const session=JSON.parse(decodeURIComponent(cookie!.value));
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
    expect([403,404]).toContain((await ctx.post(`/api/notifications/${uuid(502)}/read`,{data:{}})).status());
    expect((await rows(`SELECT status FROM public.notifications WHERE id=${quote(uuid(502))}`))[0].status).toBe('unread');
    for(let i=0;i<2;i++) expect((await ctx.post(`/api/notifications/${uuid(501)}/read`,{data:{}})).status()).toBe(200);
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
    const r=await ctx.post('/api/exemptions/review',{data:{request_id:uuid(1002),action:'approve'}});
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
