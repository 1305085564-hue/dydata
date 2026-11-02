import { splitPostgresDump } from './sql-batches.mjs';

// This adapter is deliberately limited to the captured DYData public schema.
// Managed auth/storage schemas are never imported or rewritten.
export function adaptSchemaStatement(statement) {
  const sql = statement.replace(/^(?:\s*--[^\n]*(?:\n|$))+/, '').trim();
  const changes = { uidCasts: 0, redirectedAuthForeignKeys: 0 };
  const omit = (reason) => ({ sql: null, reason, changes });
  if (/^(?:SET\s|SELECT pg_catalog\.set_config\()/i.test(sql)) return omit('per-request-settings');
  if (/^CREATE SCHEMA public\s*;/i.test(sql)) return omit('existing-managed-schema');
  if (/^ALTER DEFAULT PRIVILEGES /i.test(sql)) return omit('source-platform-owner-default');
  if (/^(?:GRANT|REVOKE)\b[\s\S]*\b(?:TO|FROM) postgres\s*;/i.test(sql)) return omit('source-owner-grant');
  if (/^GRANT\b[\s\S]*\bTO anon\s*;/i.test(sql)) return omit('anonymous-access-withheld');
  if (/^ALTER TABLE (?:ONLY )?public\.profiles\s+ADD CONSTRAINT profiles_id_fkey\b/i.test(sql)) return omit('managed-auth-root');
  if (/^(?:INSERT|COPY|UPDATE|DELETE|TRUNCATE)\b/i.test(sql)) throw new Error('Expected schema SQL, received data statement');
  let result = sql.replace(/REFERENCES auth\.users\(id\)/g, () => {
    changes.redirectedAuthForeignKeys += 1;
    return 'REFERENCES public.profiles(id)';
  });
  if (/\bauth\.users\b/.test(result)) throw new Error('Unhandled managed auth table dependency');
  result = result.replace(/\bauth\.uid\(\)/g, () => {
    changes.uidCasts += 1;
    return '(auth.uid())::uuid';
  });
  return { sql: result, changes };
}

export function adaptSchemaDump(dump) {
  const statements = [];
  const summary = { uidCasts: 0, redirectedAuthForeignKeys: 0, omitted: {} };
  for (const statement of splitPostgresDump(dump)) {
    const adapted = adaptSchemaStatement(statement);
    for (const key of ['uidCasts', 'redirectedAuthForeignKeys']) summary[key] += adapted.changes[key];
    if (adapted.sql) statements.push(adapted.sql);
    else summary.omitted[adapted.reason] = (summary.omitted[adapted.reason] ?? 0) + 1;
  }
  return { statements, summary };
}
