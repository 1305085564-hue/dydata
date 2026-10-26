// Local-only SQL A/B regression. No production credentials or business rows are printed.
// CONTENT_PERF_DB_URL must name a disposable clone, never the shared postgres database.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const args = Object.fromEntries(process.argv.slice(2).map((value, index, all) => value.startsWith('--') ? [value.slice(2), all[index + 1]] : []).filter((entry) => entry.length));
const connection = new URL(process.env.CONTENT_PERF_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/content_perf_candidate');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(connection.hostname) || !/^\/content_perf_[a-z0-9_]+$/.test(connection.pathname)) throw new Error('Use a disposable local content_perf_* database');
const baselinePath = 'supabase/migrations/20261024154236_fix_admin_content_shanghai_dates_rating_floor.sql';
const candidatePath = args.candidate || 'supabase/migrations/20261025100000_content_list_date_first.sql';
const baseline = readFileSync(baselinePath, 'utf8').replaceAll('public.admin_content_list_page(', 'public.admin_content_list_page_baseline(');
const candidate = readFileSync(candidatePath, 'utf8');
const checks = readFileSync(new URL('./content-list-performance.sql', import.meta.url), 'utf8').replace('CREATE TEMP TABLE perf_results', `${args.probe === 'true' ? "DELETE FROM perf_cases WHERE name <> 'day';" : ''}\nCREATE TEMP TABLE perf_results`);
const sql = `BEGIN;\nSET LOCAL statement_timeout='60s';\nSET LOCAL jit=off;\n${baseline}\n${candidate}\n${args['fixture-only'] === 'true' ? checks.split('CREATE TEMP TABLE perf_cases')[0] : checks}\n${args['fixture-only'] === 'true' ? 'COMMIT' : 'ROLLBACK'};`;
const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', connection.toString()], { input: sql, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
if (result.error) throw result.error;
// SQL prints only assertion names, counts and timing, never record contents.
const output = result.stdout + result.stderr;
const report = resolve(args.output || 'output/content-list-performance.txt');
mkdirSync(resolve(report, '..'), { recursive: true });
writeFileSync(report, output);
console.log(output.trim());
process.exitCode = result.status ?? 1;
