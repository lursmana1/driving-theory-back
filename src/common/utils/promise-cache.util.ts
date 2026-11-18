/** One cached load: when it started and its (shared) promise. */
export type PromiseCacheEntry<T> = { at: number; data: Promise<T> };

/**
 * Per-process cache for data that changes only when a script runs. Keeps
 * the promise, so concurrent misses share one load; a failed load is
 * dropped, not cached. Callers bound the key space (a few fixed keys).
 */
export function cachedPromise<K, T>(
  cache: Map<K, PromiseCacheEntry<T>>,
  key: K,
  ttlMs: number,
  load: () => Promise<T>,
  now = Date.now(),
): Promise<T> {
  const hit = cache.get(key);
  if (hit && now - hit.at < ttlMs) return hit.data;
  const entry = { at: now, data: load() };
  cache.set(key, entry);
  entry.data.catch(() => {
    if (cache.get(key) === entry) cache.delete(key);
  });
  return entry.data;
}
