export type CacheStats = {
  hits: number;
  misses: number;
  sets: number;
};

type CacheEntry<T> = {
  expiresAt: number;
  value?: T;
  inFlight?: Promise<T>;
};

export class TtlCache<T> {
  #store = new Map<string, CacheEntry<T>>();
  #stats: CacheStats = { hits: 0, misses: 0, sets: 0 };

  get stats(): CacheStats {
    return { ...this.#stats };
  }

  clear(): void {
    this.#store.clear();
  }

  delete(key: string): void {
    this.#store.delete(key);
  }

  async getOrSet(
    key: string,
    ttlMs: number,
    fetcher: () => Promise<T>,
    options?: { forceRefresh?: boolean }
  ): Promise<{ value: T; cached: boolean; expiresAt: number }> {
    const now = Date.now();
    const existing = this.#store.get(key);

    if (!options?.forceRefresh && existing?.value !== undefined && existing.expiresAt > now) {
      this.#stats.hits += 1;
      return { value: existing.value, cached: true, expiresAt: existing.expiresAt };
    }

    if (!options?.forceRefresh && existing?.inFlight) {
      this.#stats.hits += 1;
      const value = await existing.inFlight;
      const refreshed = this.#store.get(key);
      return {
        value,
        cached: true,
        expiresAt: refreshed?.expiresAt ?? now + ttlMs,
      };
    }

    this.#stats.misses += 1;
    const inFlight = (async () => {
      const value = await fetcher();
      const expiresAt = Date.now() + ttlMs;
      this.#store.set(key, { value, expiresAt });
      this.#stats.sets += 1;
      return value;
    })();

    this.#store.set(key, { inFlight, expiresAt: now + ttlMs });
    const value = await inFlight;
    const entry = this.#store.get(key);
    return { value, cached: false, expiresAt: entry?.expiresAt ?? now + ttlMs };
  }
}

