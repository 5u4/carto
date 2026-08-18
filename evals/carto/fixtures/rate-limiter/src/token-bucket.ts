import type { RateLimitDecision, RateLimiter } from "./rate-limit-contract"

export interface TokenBucketOptions {
  capacity: number
  refillTokensPerSecond: number
  startedAtMs: number
}

export class TokenBucket implements RateLimiter {
  private tokens: number
  private updatedAtMs: number

  constructor(private readonly options: TokenBucketOptions) {
    this.tokens = options.capacity
    this.updatedAtMs = options.startedAtMs
  }

  take(nowMs: number): RateLimitDecision {
    if (nowMs < this.updatedAtMs) {
      throw new RangeError("nowMs must not move backwards")
    }

    const elapsedMs = nowMs - this.updatedAtMs
    const refilled = Math.min(
      this.options.capacity,
      this.tokens + (elapsedMs / 1000) * this.options.refillTokensPerSecond
    )
    this.updatedAtMs = nowMs

    if (refilled < 1) {
      this.tokens = refilled
      return {
        allowed: false,
        remaining: Math.floor(refilled),
        retryAfterMs: Math.ceil(
          ((1 - refilled) / this.options.refillTokensPerSecond) * 1000
        )
      }
    }

    this.tokens = refilled - 1
    return {
      allowed: true,
      remaining: Math.floor(this.tokens),
      retryAfterMs: 0
    }
  }
}
