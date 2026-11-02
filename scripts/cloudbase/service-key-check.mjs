import { pathToFileURL } from 'node:url';

/** Offline reminder, never validates a signature or sends a credential. The
 * platform list/API ExpireAt and a real read must confirm deployment readiness. */
export function inspectServiceKey(token, now = Date.now()) {
  if (typeof token !== 'string' || token.split('.').length !== 3) throw Error('Missing/invalid service key');
  let claims;
  try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); }
  catch { throw Error('Invalid service key payload'); }
  if (claims.role !== 'service_role') throw Error('Expected service_role key');
  if (claims.exp !== undefined && (!Number.isSafeInteger(claims.exp) || claims.exp <= 0)) throw Error('Invalid expiry claim');
  const remainingDays = claims.exp === undefined ? null : (claims.exp * 1000 - now) / 86400_000;
  return { verifiedSignature: false, source: 'local JWT claims only; verify platform ExpireAt separately',
    role: claims.role, expiresAt: claims.exp === undefined ? null : new Date(claims.exp * 1000).toISOString(),
    remainingDays, state: remainingDays === null ? 'NO_EXPIRY_CLAIM_REQUIRES_PLATFORM_CHECK' : remainingDays <= 0 ? 'EXPIRED' : remainingDays <= 7 ? 'DUE_7_DAYS' : remainingDays <= 14 ? 'DUE_14_DAYS' : remainingDays <= 30 ? 'DUE_30_DAYS' : 'NOT_DUE' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = inspectServiceKey(process.env.CLOUDBASE_SERVICE_API_KEY);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.state === 'EXPIRED' ? 1 : result.state === 'DUE_7_DAYS' ? 2 : 0;
  } catch { console.error('Service key inspection failed (credential omitted)'); process.exitCode = 1; }
}
