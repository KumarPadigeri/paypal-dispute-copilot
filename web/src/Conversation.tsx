import { type CaseDetail, formatDateTime } from './api'

const WHO = { buyer: 'Buyer', you: 'You', paypal: 'PayPal' } as const

/**
 * What happened on the case, from PayPal's own records: the buyer's messages, what you sent
 * (messages, evidence, offers, refunds) and what PayPal asked for or decided. Oldest first.
 * The buyer's opening message is already on the page as claims, so it points there instead.
 */
export default function Conversation({ c }: { c: CaseDetail }) {
  if (c.conversation.length === 0) return null
  const claims = c.claims.length > 1 ? `C1–C${c.claims.length}` : 'C1'
  return (
    <section className="panel">
      <h3 className="section-title">Conversation</h3>
      <ol className="convo">
        {c.conversation.map((e, i) => (
          <li key={i} className={`convo-item ${e.who}`}>
            <span className={`convo-who ${e.who}`}>{WHO[e.who]}</span>
            <span className="convo-body">
              <span className="convo-title">{e.title}</span>
              {e.time && <span className="convo-time">{formatDateTime(e.time)}</span>}
              {e.opening && c.claims.length > 0 ? (
                <span className="convo-text muted">Their message is above, as {claims}.</span>
              ) : (
                e.text && <span className="convo-text">{e.text}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
