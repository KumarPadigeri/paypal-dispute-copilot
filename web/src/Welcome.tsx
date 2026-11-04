import { useState } from 'react'
import { type DisputeSummary, formatMoney } from './api'
import { CloseIcon } from './icons'

const KEY = 'welcomeDismissed'

function seen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** First visit: what the app does in one line, and the one click that shows it. Dismissed for good. */
export default function Welcome({ first, onOpen }: { first?: DisputeSummary; onOpen: (id: string) => void }) {
  const [hidden, setHidden] = useState(seen)
  if (hidden) return null

  const dismiss = () => {
    setHidden(true)
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      /* private mode: hidden for this visit only */
    }
  }

  return (
    <section className="welcome" aria-label="Welcome">
      <div className="welcome-text">
        <p className="welcome-title">AI that answers PayPal disputes, with proof</p>
        <p>
          Agents read each case's evidence from PayPal and draft a reply where every sentence cites it. A Verifier
          removes anything unproven, and nothing is sent until you approve.
        </p>
        <ol className="welcome-steps">
          <li>Open a case that needs a reply</li>
          <li>
            Click <strong>Draft reply</strong> and watch the agents work
          </li>
          <li>Point at a sentence to see its proof</li>
        </ol>
      </div>
      {first && (
        <button className="btn primary" onClick={() => onOpen(first.id)}>
          Try it on the {formatMoney(first.amount)} case
        </button>
      )}
      <button className="icon-btn small welcome-close" onClick={dismiss} aria-label="Dismiss welcome">
        <CloseIcon />
      </button>
    </section>
  )
}
