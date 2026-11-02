function validSnapshot(value) {
  if (value?.version !== 2) throw new Error('Identity baseline version 2 required; retain legacy evidence');
  if (!Number.isFinite(value.capturedAt) || !Array.isArray(value.rows) || value.identities !== value.rows.length) throw new Error('Invalid identity snapshot');
  const ids=new Set(), subjects=new Set();
  for (const row of value.rows) {
    if (![row.id,row.subject,row.protectedDigest,row.roleDigest].every(value=>typeof value==='string' && value.length>0) || !Object.hasOwn(row,'lastLogin') || (row.lastLogin!==null && (typeof row.lastLogin!=='string' || !Number.isFinite(Date.parse(row.lastLogin)))) || ids.has(row.id) || subjects.has(row.subject) || typeof row.builtin !== 'boolean') throw new Error('Invalid identity snapshot');
    ids.add(row.id); subjects.add(row.subject);
  }
}

// Only last_login is activity. All other Auth columns and profile roles are protected.
export function assertIdentityBaseline(before, after, events=[]) {
  validSnapshot(before); validSnapshot(after);
  if (before.identities !== after.identities) throw new Error('Protected identity count changed');
  const previous=new Map(before.rows.map(row=>[row.id,row]));
  const attributedActivities=[];
  for (const row of after.rows) {
    const old=previous.get(row.id);
    if (!old || old.subject !== row.subject || old.builtin !== row.builtin || old.protectedDigest !== row.protectedDigest || old.roleDigest !== row.roleDigest) throw new Error('Protected identity fields changed');
    if (old.lastLogin === row.lastLogin) continue;
    const changedAt=Date.parse(row.lastLogin);
    const matches=events.filter(event=>event.success === true && event.subject === row.subject && typeof event.requestId === 'string' && event.requestId.length>0 && ['password-signin','ModifyUser'].includes(event.operation) && Number.isFinite(event.startedAt) && Number.isFinite(event.finishedAt) && event.startedAt >= before.capturedAt && event.finishedAt >= event.startedAt && changedAt >= event.startedAt && changedAt <= event.finishedAt);
    if (!Number.isFinite(changedAt) || matches.length !== 1) throw new Error('Unattributed activity change; preserve recovery manifest');
    const event=matches[0];
    attributedActivities.push({subject:row.subject,field:'last_login',requestId:event.requestId,operation:event.operation});
  }
  return {protectedDifferences:0,activityChanges:attributedActivities.length,attributedActivities};
}

// Only successful management receipts from this run can explain administrator activity.
export function managementActivityFromLog(log,{environmentId,setupAt,baseline}) {
  validSnapshot(baseline);
  const administrators=baseline.rows.filter(row=>row.builtin);
  if (administrators.length !== 1) return [];
  const events=[];
  for (const line of log.split('\n')) {
    const marker='[cloudbase-management] ';
    const index=line.indexOf(marker);
    if (index<0) continue;
    let receipt;
    try { receipt=JSON.parse(line.slice(index+marker.length)); } catch { continue; }
    if (receipt.operation !== 'ModifyUser' || receipt.environmentId !== environmentId || receipt.success !== true || typeof receipt.requestId !== 'string' || !receipt.requestId || !Number.isFinite(receipt.startedAt) || !Number.isFinite(receipt.finishedAt) || receipt.startedAt<setupAt || receipt.finishedAt<receipt.startedAt || receipt.finishedAt-receipt.startedAt>30_000) continue;
    events.push({...receipt,subject:administrators[0].subject});
  }
  return events;
}
