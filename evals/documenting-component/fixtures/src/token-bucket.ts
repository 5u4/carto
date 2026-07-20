export interface RateLimitState {
  tokens: number
  updatedAt: number
}

export class TokenBucket {
  private state: RateLimitState

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number
  ) {
    this.state = { tokens: capacity, updatedAt: Date.now() }
  }

  tryTake(now: number = Date.now()): boolean {
    const elapsed = (now - this.state.updatedAt) / 1000
    const refilled = Math.min(this.capacity, this.state.tokens + elapsed * this.refillPerSecond)
    if (refilled < 1) {
      this.state = { tokens: refilled, updatedAt: now }
      return false
    }
    this.state = { tokens: refilled - 1, updatedAt: now }
    return true
  }
}
