import { useCallback, useEffect, useState } from 'react'
import DraftPanel from './DraftPanel'
import { type CaseDetail, REQUESTED, type Sentence, formatAmount, getCase, statusOf } from './api'

export default function CaseView({ id, onBack }: { id: string; onBack: () => void }) {
  const [c, setCase] = useState<CaseDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [focus, setFocus] = useState<Sentence | null>(null)

  const load = useCallback(() => {
    getCase(id).then(setCase, (e: Error) => setError(e.message))
  }, [id])

  useEffect(load, [load])

  const back = (
    <button className="back" onClick={onBack}>
      ← All disputes
    </button>
  )
  if (error) return <>{back}<div className="notice error">Could not load this case ({error}).</div></>
  if (!c) return <>{back}<div className="notice">Gathering evidence from PayPal…</div></>

  const status = statusOf(c.status)
  const requested = c.requested_from_seller.map((r) => REQUESTED[r] ?? r)
  const cites = new Set(focus?.cites ?? [])
  const answers = new Set(focus?.answers ?? [])
  const canSend = c.status === 'WAITING_FOR_SELLER_RESPONSE' && c.actions.includes('provide_evidence')
  const cantSendReason = canSend
    ? null
    : `PayPal isn't waiting for your reply on this case (${status.label.toLowerCase()}).`

  return (
    <>
      {back}
      <section className="case-head">
        <div>
          <h2>{c.reason}</h2>
          <p className="meta">
            <span className="mono">{c.dispute_id}</span>
            {c.respond_by && (
              <span className="nowrap"> · Reply by {c.respond_by.replace(' (UTC)', '')}</span>
            )}
          </p>
        </div>
        <div className="case-head-right">
          <span className="case-amount">{formatAmount(c.amount)}</span>
          <span className={`pill ${status.tone}`}>{status.label}</span>
        </div>
        {requested.length > 0 && (
          <p className="asks">
            PayPal asks you for: <strong>{requested.join(', ')}</strong>
          </p>
        )}
      </section>

      <div className="columns">
        <div className="stack">
          <section className="panel">
            <h3 className="section-title">What the buyer says</h3>
            {c.claims.length === 0 && <p className="meta">The buyer left no message.</p>}
            <ol className="items">
              {c.claims.map((cl) => (
                <li key={cl.id} className={`item ${answers.has(cl.id) ? 'lit' : ''}`}>
                  <span className="badge claim">{cl.id}</span>
                  <span>“{cl.text}”</span>
                </li>
              ))}
            </ol>
            <p className="hint">Claims are answered, never used as proof.</p>
          </section>

          <DraftPanel
            disputeId={c.dispute_id}
            canSend={canSend}
            cantSendReason={cantSendReason}
            onFocus={setFocus}
            onSent={load}
          />
        </div>

        <section className="panel evidence-panel">
          <h3 className="section-title">Evidence from PayPal</h3>
          <ol className="items">
            {c.evidence.map((e) => (
              <li key={e.id} className={`item ${cites.has(e.id) ? 'lit' : focus ? 'dim' : ''}`}>
                <span className="badge">{e.id}</span>
                <span>
                  {e.text}
                  <span className="source mono">{e.source}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  )
}
