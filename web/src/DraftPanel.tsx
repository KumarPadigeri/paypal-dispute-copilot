import { useEffect, useRef, useState } from 'react'
import { type DraftEvent, type FinalDraft, type Sentence, sendReply, statusOf, streamDraft } from './api'

type Step = { key: string; tone: 'run' | 'ok' | 'bad' | 'info'; text: string; detail?: string[] }

/** Turns stream events into the timeline the seller watches. */
function stepFor(e: DraftEvent): Step | null {
  switch (e.name) {
    case 'writing':
      return { key: `w${e.data.round}`, tone: 'run', text: e.data.round === 1 ? 'Writer is drafting a reply from the evidence…' : 'Writer is rewriting…' }
    case 'draft':
      return { key: `d${e.data.round}`, tone: 'info', text: `Writer drafted ${e.data.sentences.length} sentences` }
    case 'verifying':
      return { key: `v${e.data.round}`, tone: 'run', text: 'Verifier is checking each sentence against only the evidence it cites…' }
    case 'verdicts': {
      const bad = e.data.verdicts.filter((v) => !v.supported)
      return bad.length === 0
        ? { key: `r${e.data.round}`, tone: 'ok', text: `Verifier: all ${e.data.verdicts.length} sentences are supported` }
        : {
            key: `r${e.data.round}`,
            tone: 'bad',
            text: `Verifier rejected ${bad.length} of ${e.data.verdicts.length} sentences`,
            detail: bad.map((v) => `“${v.sentence}” — ${v.reason}`),
          }
    }
    case 'rewriting':
      return { key: 'rw', tone: 'info', text: `Sending ${e.data.rejected} rejected sentence${e.data.rejected > 1 ? 's' : ''} back to the Writer (one retry)` }
    case 'final':
      return { key: 'f', tone: 'ok', text: 'Verified reply ready for your review' }
    case 'error':
      return { key: 'e', tone: 'bad', text: `Something went wrong: ${e.data.message}` }
  }
}

type Props = {
  disputeId: string
  canSend: boolean
  cantSendReason: string | null
  onFocus: (s: Sentence | null) => void
  onSent: () => void
}

export default function DraftPanel({ disputeId, canSend, cantSendReason, onFocus, onSent }: Props) {
  const [steps, setSteps] = useState<Step[]>([])
  const [running, setRunning] = useState(false)
  const [final, setFinal] = useState<FinalDraft | null>(null)
  const [focused, setFocused] = useState<number | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [sendState, setSendState] = useState<{ ok: boolean; text: string } | null>(null)
  const stop = useRef<(() => void) | null>(null)

  useEffect(() => () => stop.current?.(), [])

  const start = () => {
    stop.current?.()
    setSteps([])
    setFinal(null)
    setFocused(null)
    onFocus(null)
    setConfirming(false)
    setSendState(null)
    setRunning(true)
    stop.current = streamDraft(disputeId, (e) => {
      const step = stepFor(e)
      // A finished "…ing" step is replaced by its result, so the timeline reads as done.
      if (step) setSteps((prev) => [...prev.map((s) => (s.tone === 'run' ? { ...s, tone: 'info' as const } : s)), step])
      if (e.name === 'final') setFinal(e.data)
      if (e.name === 'final' || e.name === 'error') setRunning(false)
    })
  }

  const focus = (i: number | null) => {
    setFocused(i)
    onFocus(i === null || !final ? null : final.sentences[i])
  }

  const send = async () => {
    setConfirming(false)
    setSendState({ ok: true, text: 'Sending to PayPal…' })
    try {
      const r = await sendReply(disputeId)
      setSendState({ ok: true, text: `Sent. PayPal status: ${statusOf(r.status).label}` })
      onSent()
    } catch (err) {
      setSendState({ ok: false, text: `Not sent: ${(err as Error).message}` })
    }
  }

  return (
    <section className="panel draft">
      <div className="draft-head">
        <h3 className="section-title">Your reply</h3>
        <button className="btn" onClick={start} disabled={running}>
          {running ? 'Working…' : final ? 'Draft again' : 'Draft reply'}
        </button>
      </div>

      {steps.length === 0 && (
        <p className="meta">
          The Writer drafts from PayPal's evidence only. The Verifier then checks every sentence and removes anything
          the evidence does not prove. Nothing is sent until you approve.
        </p>
      )}

      {steps.length > 0 && (
        <ol className="timeline" aria-live="polite">
          {steps.map((s) => (
            <li key={s.key} className={`step ${s.tone}`}>
              <span className="dot" aria-hidden="true" />
              <span>
                {s.text}
                {s.detail?.map((d) => (
                  <span key={d} className="step-detail">{d}</span>
                ))}
              </span>
            </li>
          ))}
        </ol>
      )}

      {final && (
        <>
          <div className="reply" onMouseLeave={() => focus(null)}>
            {final.sentences.map((s, i) => (
              <button
                key={i}
                className={`sentence ${focused === i ? 'on' : ''}`}
                onMouseEnter={() => focus(i)}
                onFocus={() => focus(i)}
                onClick={() => focus(focused === i ? null : i)}
              >
                {s.text}
                {s.cites.map((c) => (
                  <sup key={c} className="cite">{c}</sup>
                ))}
              </button>
            ))}
          </div>
          <p className="hint">Point at or tap a sentence to see the evidence it rests on.</p>

          {final.removed.length > 0 && (
            <div className="removed">
              <p className="section-title">Removed as unproven</p>
              {final.removed.map((r) => (
                <p key={r.sentence} className="removed-item">
                  <s>{r.sentence}</s>
                  <span className="step-detail">{r.reason}</span>
                </p>
              ))}
            </div>
          )}

          <div className="send-row">
            {!confirming ? (
              <button
                className="btn primary"
                disabled={!canSend || final.sentences.length === 0 || sendState?.text.startsWith('Sent')}
                onClick={() => setConfirming(true)}
              >
                Approve & send to PayPal
              </button>
            ) : (
              <>
                <button className="btn primary" onClick={send}>
                  Yes, send this reply
                </button>
                <button className="btn" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </>
            )}
            {!canSend && cantSendReason && <span className="meta">{cantSendReason}</span>}
            {sendState && <span className={sendState.ok ? 'send-ok' : 'send-bad'}>{sendState.text}</span>}
          </div>
        </>
      )}
    </section>
  )
}
