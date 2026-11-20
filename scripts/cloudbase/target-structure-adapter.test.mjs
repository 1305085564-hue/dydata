import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptFunctionDefinition, buildRehearsalSql, buildStructurePlan, ensureSqlStatement, orderStructureStatements } from './target-structure-adapter.mjs';

const sourceFunctions = [
  { name: 'canonical_ai_model_id', args: 'p_model_id text', definition: 'CREATE OR REPLACE FUNCTION public.canonical_ai_model_id(p_model_id text) RETURNS text LANGUAGE sql AS $$ SELECT p_model_id $$' },
  { name: 'get_leaderboard_rows', args: 'since_date date, until_date date', definition: 'CREATE OR REPLACE FUNCTION public.get_leaderboard_rows(since_date date, until_date date) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object(\'ok\', true) $$;' },
];

test('每条生成语句都有结尾分号', () => {
  const plan = buildStructurePlan(sourceFunctions);
  assert.ok(plan.statements.length > 0);
  for (const statement of plan.statements) assert.equal(statement.trimEnd().endsWith(';'), true, statement.slice(0, 80));
});

test('函数定义补齐结尾并保留完整函数体', () => {
  const sql = adaptFunctionDefinition('CREATE FUNCTION public.example() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$');
  assert.match(sql, /SELECT 1/);
  assert.equal(sql.trimEnd().endsWith(';'), true);
});

test('CloudBase auth.uid 使用目标端 UUID 转换', () => {
  assert.match(adaptFunctionDefinition('CREATE FUNCTION public.example() RETURNS uuid LANGUAGE sql AS $$ SELECT auth.uid() $$'), /\(auth\.uid\(\)\)::uuid/);
});

test('依赖清理顺序是约束和触发器、索引、新约束、新索引、新触发器', () => {
  const statements = orderStructureStatements([
    'CREATE INDEX stale_idx ON public.example(id)',
    'CREATE TRIGGER new_trigger BEFORE INSERT ON public.example FOR EACH ROW EXECUTE FUNCTION public.fn()',
    'ALTER TABLE public.example ADD CONSTRAINT new_constraint UNIQUE (id)',
    'DROP INDEX IF EXISTS public.stale_idx',
    'DROP TRIGGER IF EXISTS old_trigger ON public.example',
    'ALTER TABLE public.example DROP CONSTRAINT IF EXISTS stale_constraint',
  ]);
  const first = (pattern) => statements.findIndex((statement) => pattern.test(statement));
  assert.ok(first(/^ALTER TABLE .* DROP CONSTRAINT/i) < first(/^DROP INDEX/i));
  assert.ok(first(/^DROP INDEX/i) < first(/^ALTER TABLE .* ADD CONSTRAINT/i));
  assert.ok(first(/^ALTER TABLE .* ADD CONSTRAINT/i) < first(/^CREATE INDEX/i));
  assert.ok(first(/^CREATE INDEX/i) < first(/^CREATE TRIGGER/i));
});

test('演练 SQL 以回滚收尾并不写持久回执', () => {
  const rehearsal = buildRehearsalSql(buildStructurePlan(sourceFunctions));
  assert.match(rehearsal, /^BEGIN;/);
  assert.match(rehearsal, /ROLLBACK;\s*$/);
  assert.doesNotMatch(rehearsal, /sql_batch_receipts/);
});
