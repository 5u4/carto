import {
  assertJobTransition,
  isTerminalJobState,
  type JobState
} from "./job-lifecycle"

export interface JobRecord {
  id: string
  state: JobState
}

export class JobCoordinator {
  start(job: JobRecord): JobRecord {
    return this.transition(job, "running")
  }

  finish(job: JobRecord, succeeded: boolean): JobRecord {
    return this.transition(job, succeeded ? "succeeded" : "failed")
  }

  canSchedule(job: JobRecord): boolean {
    return !isTerminalJobState(job.state)
  }

  private transition(job: JobRecord, next: JobState): JobRecord {
    assertJobTransition(job.state, next)
    return { ...job, state: next }
  }
}
