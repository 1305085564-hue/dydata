export type VideoSnapshotRecord = {
  video_id: string;
  snapshot_type?: string | null;
  captured_at?: string | null;
};

/** Build a deterministic map containing the newest 24h snapshot per video. */
export function buildLatestVideoSnapshotMap<T extends VideoSnapshotRecord, R = T>(
  snapshots: readonly T[],
  mapValue: (snapshot: T) => R = ((snapshot) => snapshot as unknown as R),
): Map<string, R> {
  const map = new Map<string, R>();
  const capturedAt = new Map<string, number>();

  for (const snapshot of snapshots) {
    if (snapshot.snapshot_type !== "24h") continue;
    const timestamp = snapshot.captured_at ? new Date(snapshot.captured_at).getTime() : Number.NaN;
    const currentTimestamp = capturedAt.get(snapshot.video_id) ?? Number.NEGATIVE_INFINITY;
    if (!map.has(snapshot.video_id) || (Number.isFinite(timestamp) && timestamp > currentTimestamp)) {
      map.set(snapshot.video_id, mapValue(snapshot));
      capturedAt.set(snapshot.video_id, Number.isFinite(timestamp) ? timestamp : currentTimestamp);
    }
  }

  return map;
}
