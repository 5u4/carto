export interface RateLimitDecision {
  allowed: boolean
  remaining: number
  retryAfterMs: number
}

export interface RateLimiter {
  take(nowMs: number): RateLimitDecision
}
