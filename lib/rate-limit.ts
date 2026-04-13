// Simple in-memory rate limiter
const store = new Map<string, { count: number; resetAt: number }>()

// Clean expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, val] of store) {
    if (val.resetAt < now) store.delete(key)
  }
}, 5 * 60 * 1000)

/**
 * Check rate limit for a given key.
 * Returns true if the request is allowed, false if rate limited.
 */
export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (entry.count >= maxRequests) {
    return false
  }

  entry.count++
  return true
}

/**
 * Password attempt limiter — returns true if allowed, false if blocked.
 */
export function checkPasswordAttempts(key: string, maxAttempts: number = 5, blockMs: number = 15 * 60 * 1000): boolean {
  return checkRateLimit(`pwd:${key}`, maxAttempts, blockMs)
}
