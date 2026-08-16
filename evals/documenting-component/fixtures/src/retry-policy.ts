export interface RetryPolicyOptions {
  baseDelayMs: number
  maxDelayMs: number
}

export const DEFAULT_RETRY_POLICY: RetryPolicyOptions = {
  baseDelayMs: 750,
  maxDelayMs: 12000
}

export class RetryPolicy {
  constructor(private readonly options: RetryPolicyOptions) {}

  delayForAttempt(attempt: number): number {
    if (attempt < 1) {
      throw new RangeError("attempt must be positive")
    }

    return Math.min(
      this.options.maxDelayMs,
      this.options.baseDelayMs * 2 ** (attempt - 1)
    )
  }
}
