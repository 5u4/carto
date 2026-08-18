import type { RateLimitDecision, RateLimiter } from "./rate-limit-contract"
import { TokenBucket, type TokenBucketOptions } from "./token-bucket"

export const API_LIMITER_OPTIONS: TokenBucketOptions = {
  capacity: 2,
  refillTokensPerSecond: 1,
  startedAtMs: 1000
}

export const TRACE_TIMES_MS = [1000, 1000, 1000, 1500, 2000]

export function allowApiRequest(limiter: RateLimiter, nowMs: number): boolean {
  return limiter.take(nowMs).allowed
}

export function sampleApiLimitTrace(): Array<RateLimitDecision & { atMs: number }> {
  const limiter = new TokenBucket(API_LIMITER_OPTIONS)
  return TRACE_TIMES_MS.map((atMs) => ({ atMs, ...limiter.take(atMs) }))
}
