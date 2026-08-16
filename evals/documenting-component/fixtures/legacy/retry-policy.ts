export function retryDelay(attempt: number): number {
  if (attempt < 1) {
    throw new RangeError("attempt must be positive")
  }

  return Math.min(30000, 500 * 2 ** (attempt - 1))
}
