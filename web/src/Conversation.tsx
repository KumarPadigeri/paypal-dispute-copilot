import { type KeyboardEvent, type ReactNode, useEffect, useState } from 'react'
import { type CaseDetail, formatDateTime } from './api'

const WHO = { buyer: 'Buyer', you: 'You', paypal: 'PayPal' } as const
type Channel = 'paypal' | 'buyer'
const CHANNELS: { key: Channel; label: string }[] = [
  { key: 'paypal', label: 'With PayPal' },
  { key: 'buyer', label: 'With the buyer' },
]

// The last buyer message you have seen on each case, kept in this browser (works without storage)
const seenKey = (id: string) => `seenBuyer:${id}`
function lastSeen(id: string): string {
  try {
    return localStorage.getItem(seenKey(id)) ?? ''
  } catch {
    return ''
  }
}
function markSeen(id: string, time: string) {
  try {
    localStorage.setItem(seenKey(id), time)
  } catch {
    /* private mode: the dot comes back next visit */
  }
}

type Props = {
  c: CaseDetail
  reply: ReactNode // the reply to PayPal: the composer under "With PayPal"
  message: ReactNode // the message to the buyer, where PayPal allows one
}

/**
 * The case's two conversations, from PayPal's own records, as tabs: you and PayPal (what it asked
 * for, the evidence and refunds you sent it, its decision), and you and the buyer (messages and
 * offers). Each is a chat, with its composer at the bottom. Both stay mounted, so a draft survives
 * switching tabs. It opens on PayPal while PayPal waits for your reply.
 */
export default function Conversations({ c, reply, message }: Props) {
  const waiting = c.status === 'WAITING_FOR_SELLER_RESPONSE'
  const [tab, setTab] = useState<Channel>(waiting ? 'paypal' : 'buyer')
  // A dot on "With the buyer" only for buyer messages newer than the last one you saw there
  const latestBuyer = c.conversation
    .filter((e) => e.channel === 'buyer' && e.who === 'buyer' && e.time)
    .map((e) => e.time!)
    .sort()
    .at(-1)
  const [seen, setSeen] = useState(() => lastSeen(c.dispute_id))
  const unseen = !!latestBuyer && latestBuyer > seen
  useEffect(() => {
    if (tab === 'buyer' && unseen && latestBuyer) {
      markSeen(c.dispute_id, latestBuyer)
      setSeen(latestBuyer)
    }
  }, [tab, unseen, latestBuyer, c.dispute_id])

  // Arrow keys move between the tabs (the ARIA tabs pattern)
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const next = tab === 'paypal' ? 'buyer' : 'paypal'
    setTab(next)
    document.getElementById(`tab-${next}`)?.focus()
  }

  return (
    <section className="panel conversation" aria-labelledby="conversations-title">
      <h3 className="section-title" id="conversations-title">
        Conversations
      </h3>
      <div className="convo-tabs" role="tablist" aria-label="Conversations" onKeyDown={onKey}>
        {CHANNELS.map(({ key, label }) => (
          <button
            key={key}
            id={`tab-${key}`}
            role="tab"
            type="button"
            aria-selected={tab === key}
            aria-controls={`panel-${key}`}
            tabIndex={tab === key ? 0 : -1}
            className={tab === key ? 'on' : ''}
            onClick={() => setTab(key)}
          >
            {label}
            {key === 'buyer' && unseen && (
              <span className="convo-dot" aria-label="new message" role="img" />
            )}
          </button>
        ))}
      </div>
      {CHANNELS.map(({ key }) => (
        <div
          key={key}
          id={`panel-${key}`}
          role="tabpanel"
          aria-labelledby={`tab-${key}`}
          hidden={tab !== key}
        >
          <Thread c={c} channel={key} />
          {key === 'paypal' && <div className="chat-composer">{reply}</div>}
          {key === 'buyer' && message && <div className="chat-composer">{message}</div>}
        </div>
      ))}
    </section>
  )
}

/** One conversation as a chat: the other side on the left, you on the right, PayPal's events as notes. */
function Thread({ c, channel }: { c: CaseDetail; channel: Channel }) {
  const events = c.conversation.filter((e) => e.channel === channel)
  const claims = c.claims.length > 1 ? `C1–C${c.claims.length}` : 'C1'
  if (events.length === 0) return <p className="meta">Nothing here yet.</p>
  return (
    <ol className="chat" aria-label={`${channel === 'paypal' ? 'With PayPal' : 'With the buyer'}, oldest first`}>
      {events.map((e, i) => {
        const when = e.time ? formatDateTime(e.time) : ''
        if (e.kind === 'note')
          return (
            <li key={i} className="chat-note">
              <span>{e.title}</span>
              {when && <span className="chat-time">{when}</span>}
            </li>
          )
        // The buyer's opening message is already on the page as claims, so it points there
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
  )
}
