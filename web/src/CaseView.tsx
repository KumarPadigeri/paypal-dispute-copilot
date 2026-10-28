import { useCallback, useEffect, useRef, useState } from 'react'
import DraftPanel from './DraftPanel'
import { CloseIcon, CopyIcon } from './icons'
import { type CaseDetail, REQUESTED, type Sentence, formatAmount, getCase, statusOf } from './api'

export default function CaseView({ id, onClose }: { id: string; onClose: () => void }) {
  const [c, setCase] = useState<CaseDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [focus, setFocus] = useState<Sentence | null>(null)

  const load = useCallback(() => {
    getCase(id).then(setCase, (e: Error) => setError(e.message))
  }, [id])

  useEffect(load, [load])

  // Once the case has loaded, move focus into the panel (keyboard and screen-reader users land here).
  const heading = useRef<HTMLHeadingElement>(null)
  const loaded = c !== null
  useEffect(() => {
    if (loaded) heading.current?.focus({ preventScroll: true })
  }, [loaded])

  const bar = (
    <div className="pane-bar">
      <span className="pane-title">
        <span className="section-title">Dispute details</span>
        <span className="mono case-id">{id}</span>
        <CopyButton text={id} />
      </span>
      <button className="icon-btn" onClick={onClose} aria-label="Close dispute details" data-tip="Close (Esc)" data-tip-align="end">
        <CloseIcon />
      </button>
    </div>
  )
  if (error) return <>{bar}<div className="notice error">Could not load this case ({error}).</div></>
  if (!c) return <>{bar}<div className="notice">Gathering evidence from PayPal…</div></>

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
      {bar}
      <section className="case-head">
        <div>
          <h2 ref={heading} tabIndex={-1}>
            {c.reason}
          </h2>
          {c.respond_by && <p className="meta">Reply by {c.respond_by.replace(' (UTC)', '')}</p>}
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
            evidence={c.evidence}
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked: the id is still selectable text */
    }
  }
  return (
    <>
      <button className="icon-btn small" onClick={copy} aria-label="Copy case ID" data-tip="Copy case ID">
        <CopyIcon />
      </button>
      <span className="copied" aria-live="polite">
        {copied ? 'Copied' : ''}
      </span>
    </>
  )
}
