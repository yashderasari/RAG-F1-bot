type CacheEntry = { value: unknown; expiresAt: number }
const store = new Map<string, CacheEntry>()

export function cacheGet(key: string): unknown | null {
  const entry = store.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    store.delete(key)
    return null
  }
  return entry.value
}

export function cacheSet(key: string, value: unknown, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs })
}

export function cacheKey(toolName: string, args: unknown): string {
  return `${toolName}:${JSON.stringify(args)}`
}

export const TTL = {
  SESSION_META: 24 * 60 * 60 * 1000,       // 24h — stable once published
  RACE_RESULTS: 60 * 60 * 1000,             // 1h during/after race
  COMPLETED_LAPS: 365 * 24 * 60 * 60 * 1000, // indefinite (large TTL)
  WEATHER_LIVE: 5 * 60 * 1000,              // 5min during live sessions
  WEATHER_DONE: 60 * 60 * 1000,             // 1h after session
  STANDINGS: 60 * 60 * 1000,               // 1h
}
