export type CachePolicy = {
  scope: "request" | "user" | "company" | "group" | "public";
  ttlMs: number;
  maxEntries: number;
  name?: string;
};

export type CacheStats = {
  hits: number;
  misses: number;
  sets: number;
  evictions: number;
  expirations: number;
  invalidations: number;
};

type Entry<T> = { value: T; expiresAt: number; touchedAt: number };

export class BoundedTtlCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly statsValue: CacheStats = { hits: 0, misses: 0, sets: 0, evictions: 0, expirations: 0, invalidations: 0 };
  private readonly now: () => number;

  constructor(private readonly policy: CachePolicy, now: () => number = Date.now) {
    if (policy.ttlMs <= 0 || policy.maxEntries <= 0) throw new Error("cache policy must define positive ttlMs and maxEntries");
    this.now = now;
  }

  get(key: string) {
    const entry = this.entries.get(key);
    if (!entry) { this.statsValue.misses += 1; return undefined; }
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      this.statsValue.expirations += 1;
      this.statsValue.misses += 1;
      return undefined;
    }
    entry.touchedAt = this.now();
    this.statsValue.hits += 1;
    return entry.value;
  }

  set(key: string, value: T) {
    const now = this.now();
    this.entries.set(key, { value, expiresAt: now + this.policy.ttlMs, touchedAt: now });
    this.statsValue.sets += 1;
    this.evictIfNeeded();
  }

  delete(key: string) {
    if (!this.entries.delete(key)) return false;
    this.statsValue.invalidations += 1;
    return true;
  }

  deleteByPrefix(prefix: string) {
    let count = 0;
    for (const key of this.entries.keys()) {
      if (!key.startsWith(prefix)) continue;
      this.entries.delete(key);
      count += 1;
    }
    this.statsValue.invalidations += count;
    return count;
  }

  clear() {
    const count = this.entries.size;
    this.entries.clear();
    this.statsValue.invalidations += count;
  }

  get size() { return this.entries.size; }
  get stats(): CacheStats { return { ...this.statsValue }; }
  get policyDefinition() { return { ...this.policy }; }

  private evictIfNeeded() {
    while (this.entries.size > this.policy.maxEntries) {
      const oldest = [...this.entries.entries()].sort((a, b) => a[1].touchedAt - b[1].touchedAt)[0];
      if (!oldest) return;
      this.entries.delete(oldest[0]);
      this.statsValue.evictions += 1;
    }
  }
}
