import { DEFAULT_RETRY_POLICY, RetryPolicy } from "./retry-policy"

const retryPolicy = new RetryPolicy(DEFAULT_RETRY_POLICY)

export function scheduleReportRetry(attempt: number): number {
  return retryPolicy.delayForAttempt(attempt)
}
