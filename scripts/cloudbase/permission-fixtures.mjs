import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ENV_ID = 'dydata-d6g0gd1v37fcddf21';
export const PREFIX = 'dydata-permission-v2';
export const uuid = n => `f0cba501-2026-4111-a001-${String(n).padStart(12, '0')}`;
export const quote = value => `'${String(value).replaceAll("'", "''")}'`;
let manager;
export async function execute(sql) {
  if (process.env.CLOUDBASE_ENV_ID !== ENV_ID || process.env.DYDATA_GATE_BACKEND !== 'cloudbase') throw new Error('Isolation environment required');
  if (!manager) {
    const sdk = process.env.DYDATA_CLOUDBASE_SDK_PATH;
    if (!sdk) throw new Error('DYDATA_CLOUDBASE_SDK_PATH required');
    const { getCloudBaseManager } = createRequire(import.meta.url)(sdk);
    manager = await getCloudBaseManager({ cloudBaseOptions: { envId: ENV_ID, region: 'ap-shanghai' } });
  }
  const response = await manager.database.executePGSql({ EnvId: ENV_ID, Sql: sql });
  return { requestId: response.RequestId, ms: response.ExecutionTimeMs,
    rows: (response.Rows ?? []).map(row => Object.fromEntries(response.Columns.map((col,i) => [col, JSON.parse(row)[i]]))) };
}
export function manifestPath() {
  const file = process.env.DYDATA_GATE_FIXTURES_FILE;
  if (!file || !file.startsWith('/')) throw new Error('Private fixture manifest required');
  return file;
}
export function readManifest() {
  const value = JSON.parse(readFileSync(manifestPath(), 'utf8'));
  if (value.environment !== ENV_ID || value.namespace !== PREFIX) throw new Error('Wrong manifest');
  return value;
}
function save(value) {
  mkdirSync(dirname(manifestPath()), { recursive: true, mode: 0o700 });
  writeFileSync(manifestPath(), JSON.stringify(value), { mode: 0o600 });
}
export async function baseline() {
  const result = await execute(`SELECT count(*)::int AS identities, count(*) FILTER (WHERE status=3)::int AS blocked, count(*) FILTER (WHERE status=2)::int AS pending,
    md5(coalesce(string_agg(md5(to_jsonb(u)::text),'' ORDER BY id),'')) AS identity_digest FROM auth.users u WHERE sub NOT LIKE 'f0cba501-2026-4111-a001-%'`);
  return result.rows[0];
}
export async function setup() {
  if (existsSync(manifestPath()) && !readManifest().cleaned) throw new Error('Previous manifest requires recovery');
  const roles = ['memberA','memberB','adminA','adminB','ownerA','blocked','archived','pending','unassigned'];
  const users = Object.fromEntries(roles.map((name,i) => [name, { id: uuid(i+1), username: `${PREFIX}-${name.toLowerCase()}@example.invalid`, password: `T!${randomBytes(18).toString('base64url')}8a`, role: name.startsWith('admin') ? 'admin' : name.startsWith('owner') ? 'company_owner' : 'member', team: ['memberB','adminB'].includes(name) ? uuid(102) : name === 'unassigned' ? null : uuid(101) }]));
  const ids = Object.values(users).map(u=>quote(u.id)).join(',');
  const objects = [['teams',101],['accounts',201],['videos',301],['sub_topics',401],['notifications',501],['fulfillment_appeals',601],['content_observations',701],['daily_reports',801],['sample_quality_issues',901],['exemption_request',1001],['exemption_request_date',1101]];
  const occupied = objects.map(([table, first]) => `(SELECT count(*) FROM public.${table} WHERE id IN (${quote(uuid(first))},${quote(uuid(first+1))}))`).join(' + ');
  const preflight = await execute(`SELECT (SELECT count(*) FROM auth.users WHERE sub IN (${ids}) OR username LIKE '${PREFIX}-%') + (SELECT count(*) FROM public.profiles WHERE id IN (${ids})) + (SELECT count(*) FROM public.videos WHERE id=${quote(uuid(303))}) + ${occupied} AS conflicts`);
  if (Number(preflight.rows[0].conflicts)) throw new Error('Fixture identifiers occupied; refusing overwrite');
  const manifest = { environment: ENV_ID, namespace: PREFIX, users, baseline: await baseline(), phase: 'prepared', cleaned: false, requests: [] };
  save(manifest);
  const statements = [`INSERT INTO public.teams(id,name) VALUES (${quote(uuid(101))},'${PREFIX}-A'),(${quote(uuid(102))},'${PREFIX}-B');`];
  for (const u of Object.values(users)) {
    statements.push(`INSERT INTO auth.users(project,sub,username,email,password,status,email_verified,type,providers,name,created_at,updated_at) VALUES (${quote(ENV_ID)},${quote(u.id)},${quote(u.username)},${quote(u.username)},replace(encode(convert_to(crypt(${quote(u.password)},gen_salt('bf',10)),'UTF8'),'base64'),chr(10),''),1,true,'external','[]'::jsonb,'${PREFIX}',now(),now());`);
    statements.push(`INSERT INTO public.profiles(id,name,role,company_role,team_id,membership_status) VALUES (${quote(u.id)},${quote(PREFIX+'-'+u.username.split('@')[0])},${quote(u.role === 'company_owner' ? 'owner' : u.role)},${quote(u.role)},${u.team ? quote(u.team) : 'NULL'},'active');`);
  }
  for (const [i,key] of ['memberA','memberB'].entries()) {
    const u = users[key];
    statements.push(`INSERT INTO public.accounts(id,profile_id,name) VALUES (${quote(uuid(201+i))},${quote(u.id)},'${PREFIX}-${key}');
      INSERT INTO public.videos(id,user_id,account_id,video_title) VALUES (${quote(uuid(301+i))},${quote(u.id)},${quote(uuid(201+i))},'${PREFIX}-${key}');
      INSERT INTO public.sub_topics(id,title,hook,created_by) VALUES (${quote(uuid(401+i))},'${PREFIX}-${key}','fixture',${quote(u.id)});
      INSERT INTO public.notifications(id,user_id,type,category,title,source_type) VALUES (${quote(uuid(501+i))},${quote(u.id)},'system','feed','${PREFIX}','${PREFIX}');
      INSERT INTO public.fulfillment_appeals(id,user_id,account_id,record_date,reason) VALUES (${quote(uuid(601+i))},${quote(u.id)},${quote(uuid(201+i))},current_date-1,'${PREFIX}');
      INSERT INTO public.content_observations(id,video_id,observer_id,note) VALUES (${quote(uuid(701+i))},${quote(uuid(301+i))},${quote(users['admin'+(i?'B':'A')].id)},'${PREFIX}');`);
    statements.push(`INSERT INTO public.daily_reports(id,user_id,account_id,video_id,report_date,title,submitter) VALUES (${quote(uuid(801+i))},${quote(u.id)},${quote(uuid(201+i))},${quote(uuid(301+i))},current_date-1,'${PREFIX}','${PREFIX}');
      INSERT INTO public.sample_quality_issues(id,report_id,video_id,severity) VALUES (${quote(uuid(901+i))},${quote(uuid(801+i))},${quote(uuid(301+i))},'warning');
      INSERT INTO public.exemption_request(id,profile_id,applicant_user_id,team_id,exemption_type,start_date,end_date,reason) VALUES (${quote(uuid(1001+i))},${quote(u.id)},${quote(u.id)},${quote(u.team)},'range',current_date-1,current_date-1,'${PREFIX}');
      INSERT INTO public.exemption_request_date(id,request_id,request_date) VALUES (${quote(uuid(1101+i))},${quote(uuid(1001+i))},current_date-1);`);
  }
  const result = await execute(`BEGIN; ${statements.join('\n')} COMMIT;`);
  manifest.phase = 'ready'; manifest.requests.push(result.requestId); save(manifest);
  console.log(JSON.stringify({ environment: ENV_ID, users: roles.length, requestId: result.requestId }));
}
export async function cleanup() {
  if (!existsSync(manifestPath())) throw new Error('Missing recovery manifest');
  const manifest = readManifest();
  const ids = Object.values(manifest.users).map(u=>quote(u.id)).join(',');
  const conflict = await execute(`SELECT count(*) AS conflicts FROM auth.users WHERE sub IN (${ids}) AND (project IS DISTINCT FROM ${quote(ENV_ID)} OR username NOT LIKE '${PREFIX}-%')`);
  if (Number(conflict.rows[0].conflicts)) throw new Error('Ownership changed; retain manifest');
  const result = await execute(`BEGIN;
    DELETE FROM public.content_observations WHERE observer_id IN (${ids});
    DELETE FROM public.sub_topic_claims WHERE user_id IN (${ids});
    DELETE FROM public.notifications WHERE user_id IN (${ids});
    DELETE FROM public.audit_logs WHERE user_id IN (${ids});
    DELETE FROM public.exemption_grant WHERE user_id IN (${ids});
    DELETE FROM public.exemption_request_date WHERE request_id IN (SELECT id FROM public.exemption_request WHERE applicant_user_id IN (${ids}));
    DELETE FROM public.exemption_request WHERE applicant_user_id IN (${ids});
    DELETE FROM public.sample_quality_issues WHERE report_id IN (SELECT id FROM public.daily_reports WHERE user_id IN (${ids}));
    DELETE FROM public.daily_reports WHERE user_id IN (${ids});
    DELETE FROM public.fulfillment_appeals WHERE user_id IN (${ids});
    DELETE FROM public.videos WHERE user_id IN (${ids});
    DELETE FROM public.accounts WHERE profile_id IN (${ids});
    DELETE FROM public.sub_topics WHERE created_by IN (${ids});
    DELETE FROM public.profiles WHERE id IN (${ids});
    DELETE FROM auth.token WHERE user_id IN (${ids}) AND project=${quote(ENV_ID)};
    DELETE FROM auth.authorized WHERE user_id IN (${ids}) AND project=${quote(ENV_ID)};
    DELETE FROM auth.identity WHERE sub IN (${ids}) AND project=${quote(ENV_ID)};
    DELETE FROM auth.users_history WHERE sub IN (${ids}) AND project=${quote(ENV_ID)};
    DELETE FROM auth.users WHERE sub IN (${ids}) AND project=${quote(ENV_ID)} AND username LIKE '${PREFIX}-%';
    DELETE FROM public.teams WHERE id IN (${quote(uuid(101))},${quote(uuid(102))}) AND name IN ('${PREFIX}-A','${PREFIX}-B');
    COMMIT;`);
  const zero = await execute(`SELECT (SELECT count(*) FROM auth.users WHERE sub IN (${ids})) + (SELECT count(*) FROM public.profiles WHERE id IN (${ids})) + (SELECT count(*) FROM public.videos WHERE user_id IN (${ids})) + (SELECT count(*) FROM public.accounts WHERE profile_id IN (${ids})) + (SELECT count(*) FROM public.sub_topics WHERE created_by IN (${ids})) + (SELECT count(*) FROM public.notifications WHERE user_id IN (${ids})) + (SELECT count(*) FROM public.audit_logs WHERE user_id IN (${ids})) + (SELECT count(*) FROM public.fulfillment_appeals WHERE user_id IN (${ids})) + (SELECT count(*) FROM public.teams WHERE id IN (${quote(uuid(101))},${quote(uuid(102))})) AS remaining`);
  const linked = await execute(`SELECT (SELECT count(*) FROM auth.token WHERE user_id IN (${ids})) + (SELECT count(*) FROM auth.authorized WHERE user_id IN (${ids})) + (SELECT count(*) FROM auth.identity WHERE sub IN (${ids})) + (SELECT count(*) FROM auth.users_history WHERE sub IN (${ids})) + (SELECT count(*) FROM public.content_observations WHERE observer_id IN (${ids})) + (SELECT count(*) FROM public.daily_reports WHERE user_id IN (${ids})) + (SELECT count(*) FROM public.sample_quality_issues WHERE id IN (${quote(uuid(901))},${quote(uuid(902))})) + (SELECT count(*) FROM public.exemption_request WHERE applicant_user_id IN (${ids})) + (SELECT count(*) FROM public.exemption_request_date WHERE id IN (${quote(uuid(1101))},${quote(uuid(1102))})) + (SELECT count(*) FROM public.exemption_grant WHERE user_id IN (${ids})) AS remaining`);
  if (Number(zero.rows[0].remaining) || Number(linked.rows[0].remaining)) throw new Error('Cleanup incomplete');
  if (JSON.stringify(await baseline()) !== JSON.stringify(manifest.baseline)) throw new Error('Non-fixture identities changed');
  manifest.cleaned = true; manifest.phase = 'cleaned'; manifest.requests.push(result.requestId,zero.requestId,linked.requestId); save(manifest);
  console.log(JSON.stringify({ environment: ENV_ID, remaining: 0, identityBaselineUnchanged: true, requestId: zero.requestId }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void (async () => { try {
    if (process.argv[2] === 'setup') await setup();
    else if (process.argv[2] === 'cleanup') await cleanup();
    else throw new Error('Expected setup or cleanup');
  } catch (error) {
    // SQL errors can include credentials: keep the diagnostic in the private recovery directory.
    writeFileSync(resolve(dirname(manifestPath()), `fixture-${process.argv[2]}-error-private.txt`), String(error?.stack ?? error), { mode: 0o600 });
    console.error('Fixture operation failed; inspect private diagnostic and recovery manifest.'); process.exitCode = 1;
  } })();
}
