import type { ReactNode } from 'react'
import { type CaseDetail, formatDateTime } from './api'

const WHO = { buyer: 'Buyer', you: 'You', paypal: 'PayPal' } as const

/**
 * The case as a chat, from PayPal's own records: the buyer on the left, you on the right, and
 * PayPal's events as small notes in the middle. Your next message is written at the bottom
 * (`composer`), like any messaging app. The buyer's opening message is already on the page as
 * claims, so its bubble points there instead of repeating it.
 */
export default function Conversation({ c, composer }: { c: CaseDetail; composer?: ReactNode }) {
  if (c.conversation.length === 0 && !composer) return null
  const claims = c.claims.length > 1 ? `C1–C${c.claims.length}` : 'C1'
  return (
    <section className="panel conversation">
      <h3 className="section-title">Conversation</h3>
      <ol className="chat" aria-label="Conversation, oldest first">
        {c.conversation.map((e, i) => {
          const when = e.time ? formatDateTime(e.time) : ''
          if (e.kind === 'note')
            return (
              <li key={i} className="chat-note">
                <span>{e.title}</span>
                {when && <span className="chat-time">{when}</span>}
              </li>
            )
          const opening = e.opening && c.claims.length > 0
          return (
            <li key={i} className={`chat-line ${e.who}`}>
              <span className="chat-meta">
                {WHO[e.who]}
                {when && ` · ${when}`}
              </span>
              <span className="bubble">
                {/* an action (offer, evidence, refund) says what it was; a plain message is just its text */}
                {(e.kind === 'action' || opening) && <span className="bubble-title">{e.title}</span>}
                {opening ? (
                  <span className="muted">Their message is above, as {claims}.</span>
                ) : (
                  e.text && <span className="bubble-text">{e.text}</span>
                )}
              </span>
            </li>
          )
        })}
      </ol>
      {composer && <div className="chat-composer">{composer}</div>}
    </section>
  )
}
