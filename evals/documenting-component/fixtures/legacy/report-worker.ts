import { retryDelay } from "./retry-policy"

export function scheduleReportRetry(attempt: number): number {
  return retryDelay(attempt)
}
