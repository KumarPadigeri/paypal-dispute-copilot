import type { CaseDetail } from './api'
import { TickIcon } from './icons'
import { statusOf } from './status'

const ARBITRATION = ['PRE_ARBITRATION', 'ARBITRATION']

// What each stage means, shown on hover.
const MEANS: Record<string, string> = {
  INQUIRY: 'You and the buyer try to settle it',
  CLAIM: 'PayPal reviews both sides and decides',
  CHARGEBACK: "The buyer's card issuer decides",
  ARBITRATION: 'The final decision',
  CLOSED: 'The case is over',
}

// "Oct 28", like the reply-by date
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

type Step = { key: string; label: string; date?: string }

/** PayPal's dispute stages as a stepper: done steps get a check, the current one is highlighted. */
export default function Timeline({ c }: { c: CaseDetail }) {
  const closed = statusOf(c.status).group === 'resolved'
  const external = c.channel === 'EXTERNAL'
  const second = external ? 'CHARGEBACK' : 'CLAIM'
  const steps: Step[] = [
    // A card chargeback starts at the issuer, with no inquiry first.
    ...(external ? [] : [{ key: 'INQUIRY', label: 'Inquiry' }]),
    { key: second, label: external ? 'Chargeback' : 'Claim' },
    // Only shown when a case actually gets there.
    ...(ARBITRATION.includes(c.stage ?? '') ? [{ key: 'ARBITRATION', label: 'Arbitration' }] : []),
    { key: 'CLOSED', label: 'Closed', date: closed && c.updated_iso ? shortDate(c.updated_iso) : undefined },
  ]
  // The first stage starts when the case was opened.
  if (c.opened_iso) steps[0].date = shortDate(c.opened_iso)

  const stageKey = ARBITRATION.includes(c.stage ?? '') ? 'ARBITRATION' : c.stage === 'CHARGEBACK' ? second : c.stage
  const reached = Math.max(0, steps.findIndex((s) => s.key === stageKey))
  const last = steps.length - 1
  const current = closed ? last : reached

  // A case closed at the inquiry never went to a claim: that step shows as skipped, not done.
  const stateOf = (i: number) => {
    if (i < reached || (closed && (i === reached || i === last))) return 'done'
    if (i === current) return 'now'
    return i < current ? 'skipped' : 'next'
  }

  return (
    <ol className="stages" aria-label="Dispute stages">
      {steps.map((s, i) => {
        const state = stateOf(i)
        return (
          <li key={s.key} className={`stage ${state}`} aria-current={i === current ? 'step' : undefined}>
            <span className="stage-dot" aria-hidden="true">
              {state === 'done' && <TickIcon />}
            </span>
            <span className="stage-text">
              <span className="stage-label" data-tip={MEANS[s.key]}>
                {s.label}
                {state === 'skipped' && <span className="sr-only"> (skipped)</span>}
              </span>
              {s.date && <span className="stage-date">{s.date}</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
