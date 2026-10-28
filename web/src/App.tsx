import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import CaseView from './CaseView'
import { CheckIcon, ClockIcon, ReplyIcon } from './icons'
import { type DisputeSummary, formatDate, formatMoney, listDisputes, statusOf } from './api'

// Status filters, in the seller's words, each with its own icon and color.
type Filter = {
  key: string
  label: string
  tone: 'all' | 'warn' | 'info' | 'ok'
  Icon: (() => JSX.Element) | null
  match: (status: string) => boolean
}

const FILTERS: Filter[] = [
  { key: 'all', label: 'All', tone: 'all', Icon: null, match: () => true },
  {
    key: 'reply',
    label: 'Needs reply',
    tone: 'warn',
    Icon: ReplyIcon,
    match: (s) => s === 'WAITING_FOR_SELLER_RESPONSE',
  },
  {
    key: 'waiting',
    label: 'Waiting',
    tone: 'info',
    Icon: ClockIcon,
    match: (s) => s === 'WAITING_FOR_BUYER_RESPONSE' || s === 'UNDER_REVIEW',
  },
  { key: 'closed', label: 'Closed', tone: 'ok', Icon: CheckIcon, match: (s) => s === 'RESOLVED' },
]

const needsReply = (d: DisputeSummary) => Number(d.status === 'WAITING_FOR_SELLER_RESPONSE')

function DisputeList({ openId, onOpen }: { openId: string | null; onOpen: (id: string) => void }) {
  const [disputes, setDisputes] = useState<DisputeSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')
  const [category, setCategory] = useState<string | null>(null)

  useEffect(() => {
    listDisputes().then(
      // Cases that need the seller's reply come first.
      (list) => setDisputes([...list].sort((a, b) => needsReply(b) - needsReply(a))),
      (e: Error) => setError(e.message),
    )
  }, [])

  if (error) return <div className="notice error">Could not load disputes from PayPal ({error}).</div>
  if (!disputes) return <div className="notice">Loading disputes from PayPal…</div>

  const categories = [...new Set(disputes.map((d) => d.reason))]
  const statusMatch = FILTERS.find((f) => f.key === filter)!.match
  const shown = disputes.filter((d) => statusMatch(d.status) && (!category || d.reason === category))

  return (
    <>
      <div className="chips" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`chip tone-${f.tone} ${filter === f.key ? 'on' : ''}`}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.Icon && <f.Icon />}
            {f.label}
            <span className="count">{disputes.filter((d) => f.match(d.status)).length}</span>
          </button>
        ))}
      </div>
      {categories.length > 1 && (
        <div className="chips" role="group" aria-label="Filter by category">
          {categories.map((c) => (
            <button
              key={c}
              className={`chip small ${category === c ? 'on' : ''}`}
              aria-pressed={category === c}
              onClick={() => setCategory(category === c ? null : c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="notice">{disputes.length ? 'No disputes match this filter.' : 'No disputes. Nice.'}</div>
      ) : (
        <div className="list">
          {shown.map((d) => {
            const status = statusOf(d.status)
            return (
              <button
                key={d.id}
                className={`row ${openId === d.id ? 'selected' : ''}`}
                aria-current={openId === d.id}
                onClick={() => onOpen(d.id)}
              >
                <span className="amount">{formatMoney(d.amount)}</span>
                <span className="meta date">{formatDate(d.created)}</span>
                <span className="meta id mono">{d.id}</span>
                <span className="pills">
                  <span className="pill category">{d.reason}</span>
                  <span className={`pill ${status.tone}`}>{status.label}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

// Tiny hash router: "#/case/<id>" opens a case, anything else shows the list.
const caseIdFromHash = () => {
  const m = location.hash.match(/^#\/case\/(.+)$/)
  return m ? decodeURIComponent(m[1]) : null
}

export default function App() {
  const [openId, setOpenId] = useState<string | null>(caseIdFromHash)

  useEffect(() => {
    const onHash = () => setOpenId(caseIdFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Esc closes the open case, like closing a side panel.
  useEffect(() => {
    if (!openId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') location.hash = ''
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId])

  return (
    <div className="app">
      <header className="topbar">
        <img src="/favicon.svg" alt="" />
        <h1>Dispute Copilot</h1>
        <span className="tag">PayPal sandbox</span>
      </header>
      {/* No case open: list uses the full width. Case open: list left, case panel right
          with a close button (on phones the panel covers the screen). See index.css. */}
      <div className={`layout ${openId ? 'has-case' : ''}`}>
        <aside className="list-pane">
          <h2 className="section-title">Disputes</h2>
          <DisputeList
            openId={openId}
            onOpen={(id) => (location.hash = `/case/${encodeURIComponent(id)}`)}
          />
        </aside>
        {openId && (
          <main className="case-pane">
            <CaseView key={openId} id={openId} onClose={() => (location.hash = '')} />
          </main>
        )}
      </div>
    </div>
  )
}
