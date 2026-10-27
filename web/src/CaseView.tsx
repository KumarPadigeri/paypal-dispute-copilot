import { useEffect, useState } from 'react'
import { type CaseDetail, REQUESTED, formatAmount, getCase, statusOf } from './api'

export default function CaseView({ id, onBack }: { id: string; onBack: () => void }) {
  const [c, setCase] = useState<CaseDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getCase(id).then(setCase, (e: Error) => setError(e.message))
  }, [id])

  const back = (
    <button className="back" onClick={onBack}>
      ← All disputes
    </button>
  )
  if (error) return <>{back}<div className="notice error">Could not load this case ({error}).</div></>
  if (!c) return <>{back}<div className="notice">Gathering evidence from PayPal…</div></>

  const status = statusOf(c.status)
  const requested = c.requested_from_seller.map((r) => REQUESTED[r] ?? r)

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
        <section className="panel">
          <h3 className="section-title">What the buyer says</h3>
          {c.claims.length === 0 && <p className="meta">The buyer left no message.</p>}
          <ol className="items">
            {c.claims.map((cl) => (
              <li key={cl.id} className="item">
                <span className="badge claim">{cl.id}</span>
                <span>“{cl.text}”</span>
              </li>
            ))}
          </ol>
          <p className="hint">Claims are answered, never used as proof.</p>
        </section>

        <section className="panel">
          <h3 className="section-title">Evidence from PayPal</h3>
          <ol className="items">
            {c.evidence.map((e) => (
              <li key={e.id} className="item">
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
