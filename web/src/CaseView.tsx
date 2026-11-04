import { useCallback, useEffect, useRef, useState } from 'react'
import Deadline from './Deadline'
import Conversation from './Conversation'
import DraftPanel from './DraftPanel'
import { CaseSkeleton } from './Skeleton'
import { AlertIcon, CheckIcon, CloseIcon, CopyIcon } from './icons'
import {
  type CaseDetail,
  REQUESTED,
  type Sentence,
  formatAmount,
  getCase,
  resolveCase,
  DISPUTES_CHANGED,
} from './api'
import StatusPill from './StatusPill'
import Timeline from './Timeline'
import { statusOf } from './status'

export default function CaseView({ id, onClose }: { id: string; onClose: () => void }) {
  const [c, setCase] = useState<CaseDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [focus, setFocus] = useState<Sentence | null>(null)

  const load = useCallback(() => {
    getCase(id).then(setCase, (e: Error) => setError(e.message))
  }, [id])

  useEffect(load, [load])

  // After a send, refund or offer: reload this case and tell the inbox to fetch PayPal's new status
  const changed = useCallback(() => {
    load()
    window.dispatchEvent(new Event(DISPUTES_CHANGED))
  }, [load])

  // Focus moves into the panel at once (its title, while PayPal's data loads), then to the case
  // heading when it arrives: keyboard and screen-reader users never land on nothing.
  const title = useRef<HTMLSpanElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const loaded = c !== null
  useEffect(() => {
    title.current?.focus({ preventScroll: true })
  }, [])
  useEffect(() => {
    if (loaded) heading.current?.focus({ preventScroll: true })
  }, [loaded])

  const bar = (
    <div className="pane-bar">
      <span className="pane-title" ref={title} tabIndex={-1}>
        <span className="section-title">Dispute details</span>
        <span className="mono case-id">{id}</span>
        <CopyButton text={id} />
      </span>
      <button className="icon-btn" onClick={onClose} aria-label="Close dispute details" data-tip="Close (Esc)" data-tip-align="end">
        <CloseIcon />
      </button>
    </div>
  )
  // The bar stays put; only the body below it scrolls (no sticky positioning, so nothing jumps).
  if (error)
    return (
      <>
        {bar}
        <div className="case-body">
          <div className="notice error">Could not load this case ({error}).</div>
        </div>
      </>
    )
  if (!c)
    return (
      <>
        {bar}
        <div className="case-body">
          <CaseSkeleton />
        </div>
      </>
    )

  const status = statusOf(c.status)
  // What PayPal asks for only matters while it waits for the seller.
  // (the evidence check below says it when there is one)
  const requested =
    status.group === 'reply' && !c.check ? c.requested_from_seller.map((r) => REQUESTED[r] ?? r) : []
  const due = status.group === 'reply' && c.respond_by_iso
  const cites = new Set(focus?.cites ?? [])
  const answers = new Set(focus?.answers ?? [])
  const canSend = c.status === 'WAITING_FOR_SELLER_RESPONSE' && c.actions.includes('provide_evidence')
  // PayPal lets the seller message the buyer only while the case is open. When the evidence
  // can't support a reply it can't help the buyer either: the advised resolution has its own note.
  const canMessage = c.actions.includes('send_message') && !c.advice?.blocks_draft
  const cantSendReason = canSend
    ? null
    : `PayPal isn't waiting for your reply on this case (${status.detail.toLowerCase()}).`

  return (
    <>
      {bar}
      <div className="case-body">
        <section className="case-head">
          <h2 ref={heading} tabIndex={-1}>
            {c.reason}
          </h2>
          <div className="case-head-right">
            <span className="case-amount">{formatAmount(c.amount)}</span>
            <StatusPill status={c.status} />
          </div>
          {/* The pill already says the status; this line adds only what it can't: the deadline
              (or who the case is waiting on) and what PayPal asks for. */}
          {(due || status.group === 'waiting' || requested.length > 0) && (
            <p className="meta">
              {due ? <Deadline iso={c.respond_by_iso} /> : status.group === 'waiting' && <span>{status.detail}</span>}
              {requested.length > 0 && (
                <span className="asks">
                  PayPal asks for: <strong>{requested.join(', ')}</strong>
                </span>
              )}
            </p>
          )}
          <Timeline c={c} />
          {c.check && (
            <p className={`evidence-check ${c.check.tone}`}>
              {c.check.tone === 'ok' ? <CheckIcon /> : <AlertIcon />}
              <span>{c.check.text}</span>
            </p>
          )}
        </section>

        {c.advice && <AdviceBox disputeId={c.dispute_id} advice={c.advice} amount={c.amount} onDone={changed} />}

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
              draftBlocked={c.advice?.blocks_draft ?? false}
              onFocus={setFocus}
              onSent={changed}
            />

            {canMessage && (
              <DraftPanel
                kind="message"
                disputeId={c.dispute_id}
                evidence={c.evidence}
                canSend={canMessage}
                cantSendReason={null}
                draftBlocked={false}
                onFocus={setFocus}
                onSent={changed}
              />
            )}

            <Conversation c={c} />
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

type AdviceProps = {
  disputeId: string
  advice: NonNullable<CaseDetail['advice']>
  amount: string
  onDone: () => void
}

/** Plain-code advice, plus the fair ways out PayPal allows right now (merchant confirms first). */
function AdviceBox({ disputeId, advice, amount, onDone }: AdviceProps) {
  const [picked, setPicked] = useState<string | null>(null)
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null)
  const choice = advice.resolutions.find((r) => r.key === picked)

  const confirm = async () => {
    if (!choice) return
    setState({ ok: true, text: 'Sending to PayPal…' })
    try {
      const r = await resolveCase(disputeId, choice.key)
      setPicked(null)
      setState({ ok: true, text: `Done. ${statusOf(r.status).detail}.` })
      onDone()
    } catch (err) {
      const msg = (err as Error).message
      setState({ ok: false, text: msg.includes('PIN') ? 'This needs the demo PIN (unlock it in “Your reply” below).' : msg })
    }
  }

  return (
    <section className="advice" role="note">
      <AlertIcon />
      <div>
        <h3>{advice.title}</h3>
        <p>{advice.text}</p>
        {advice.resolutions.length > 0 && !choice && (
          <div className="advice-actions">
            {/* Best first: the recommended option is the blue one. It only opens the confirm step. */}
            {advice.resolutions.map((r, i) => (
              <button key={r.key} className={i === 0 ? 'btn primary' : 'btn'} onClick={() => setPicked(r.key)}>
                {r.label}
              </button>
            ))}
          </div>
        )}
        {choice && (
          <div className="advice-confirm">
            <p>
              <strong>{choice.label}</strong> ({formatAmount(amount)}). PayPal will receive this note:
            </p>
            <blockquote>{choice.note}</blockquote>
            <div className="advice-actions">
              <button className="btn primary" onClick={confirm} autoFocus>
                Yes, {choice.label.toLowerCase()}
              </button>
              <button className="btn" onClick={() => setPicked(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {state && <p className={state.ok ? 'send-ok' : 'send-bad'}>{state.text}</p>}
      </div>
    </section>
  )
}
