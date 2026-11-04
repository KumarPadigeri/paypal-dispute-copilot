import { type Progress, REWRITE, STEPS } from './agentProgress'
import { TickIcon } from './icons'

/** Same look as the case's stage stepper: done steps get a check, the current one pulses. */
export default function AgentSteps({ progress }: { progress: Progress }) {
  const { now, skipRewrite, failed } = progress
  const stateOf = (i: number) => {
    if (i === REWRITE && skipRewrite) return 'skipped'
    if (i < now) return 'done'
    if (i === now) return failed ? 'failed' : 'now'
    return 'next'
  }
  return (
    <ol className="stages agent-steps" aria-label="Agent steps">
      {STEPS.map((label, i) => {
        const state = stateOf(i)
        return (
          <li key={label} className={`stage ${state}`} aria-current={i === now ? 'step' : undefined}>
            <span className="stage-dot" aria-hidden="true">
              {state === 'done' && <TickIcon />}
            </span>
            <span className="stage-text">
              <span className="stage-label">
                {label}
                {state === 'skipped' && <span className="sr-only"> (not needed)</span>}
              </span>
              {i === REWRITE && (state === 'next' || state === 'skipped') && (
                <span className="stage-date">{state === 'skipped' ? 'not needed' : 'if needed'}</span>
              )}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
