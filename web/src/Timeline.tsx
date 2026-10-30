import { type CaseDetail, formatDate } from './api'
import { TickIcon } from './icons'
import { statusOf } from './status'

const ARBITRATION = ['PRE_ARBITRATION', 'ARBITRATION']

// What the current stage means, in plain words.
const NOW: Record<string, string> = {
  INQUIRY:
    'Inquiry: you and the buyer try to settle it. If it is not settled, the buyer can escalate it to a claim and PayPal decides.',
  CLAIM: 'Claim: PayPal reviews the evidence from both sides and decides.',
  CHARGEBACK: "Chargeback: the buyer's card issuer reviews the evidence and decides.",
  ARBITRATION: 'Arbitration: the last stage, where the final decision is made.',
}

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
    { key: 'CLOSED', label: 'Closed', date: closed ? formatDate(c.updated_iso) : undefined },
  ]
  steps[0].date = formatDate(c.opened_iso)

  const stageKey = ARBITRATION.includes(c.stage ?? '') ? 'ARBITRATION' : c.stage === 'CHARGEBACK' ? second : c.stage
  const reached = Math.max(0, steps.findIndex((s) => s.key === stageKey))
  const last = steps.length - 1
  const current = closed ? last : reached
  const note = closed ? null : NOW[steps[current].key]

  // A case closed at the inquiry never went to a claim: that step shows as skipped, not done.
  const stateOf = (i: number) => {
    if (i < reached || (closed && (i === reached || i === last))) return 'done'
    if (i === current) return 'now'
    return i < current ? 'skipped' : 'next'
  }

  return (
    <div className="stage-timeline">
      <ol className="stages" aria-label="Dispute stages">
        {steps.map((s, i) => {
          const state = stateOf(i)
          return (
            <li key={s.key} className={`stage ${state}`} aria-current={i === current ? 'step' : undefined}>
              <span className="stage-dot" aria-hidden="true">
                {state === 'done' && <TickIcon />}
              </span>
              <span className="stage-label">
                {s.label}
                {state === 'skipped' && <span className="sr-only"> (skipped)</span>}
              </span>
              {s.date && <span className="stage-date">{s.date}</span>}
            </li>
          )
        })}
      </ol>
      {note && <p className="stage-note">{note}</p>}
    </div>
  )
}
