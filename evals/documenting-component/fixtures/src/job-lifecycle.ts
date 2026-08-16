export const JOB_STATES = ["queued", "running", "succeeded", "failed"] as const

export type JobState = (typeof JOB_STATES)[number]

export const ALLOWED_JOB_TRANSITIONS: Record<JobState, readonly JobState[]> = {
  queued: ["running"],
  running: ["succeeded", "failed"],
  succeeded: [],
  failed: []
}

export function assertJobTransition(from: JobState, to: JobState): void {
  if (!ALLOWED_JOB_TRANSITIONS[from].includes(to)) {
    throw new Error(`Invalid job transition: ${from} -> ${to}`)
  }
}

export function isTerminalJobState(state: JobState): boolean {
  return ALLOWED_JOB_TRANSITIONS[state].length === 0
}
