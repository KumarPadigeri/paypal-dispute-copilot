import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import CaseView from './CaseView'
import Splitter, { LIST_DEFAULT } from './Splitter'
import ThemeToggle from './ThemeToggle'
import { CheckIcon, ClockIcon, GridIcon, ListIcon, ReplyIcon } from './icons'
import { type DisputeSummary, formatAgo, formatDate, formatMoney, listDisputes, statusOf } from './api'

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

type View = 'list' | 'grid'

/** The seller's List/Grid choice, remembered in this browser (works without storage too). */
function useView(): [View, (v: View) => void] {
  const [view, setView] = useState<View>(() => {
    try {
      return localStorage.getItem('view') === 'grid' ? 'grid' : 'list'
    } catch {
      return 'list'
    }
  })
  const save = (v: View) => {
    setView(v)
    try {
      localStorage.setItem('view', v)
    } catch {
      /* private mode: keep it for this visit only */
    }
  }
  return [view, save]
}

function useNarrow(query = '(max-width: 700px)') {
  const [narrow, setNarrow] = useState(() => matchMedia(query).matches)
  useEffect(() => {
    const mq = matchMedia(query)
    const onChange = () => setNarrow(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return narrow
}

function DisputeCards({ items, openId, onOpen }: ListProps) {
  return (
    <div className="list">
      {items.map((d) => {
        const status = statusOf(d.status)
        return (
          <button
            key={d.id}
            className={`row ${openId === d.id ? 'selected' : ''}`}
            data-open={d.id}
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
  )
}

function DisputeTable({ items, openId, onOpen }: ListProps) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Case</th>
            <th scope="col">Reason</th>
            <th scope="col" className="num">Amount</th>
            <th scope="col">Status</th>
            <th scope="col">Stage</th>
            <th scope="col">Opened</th>
            <th scope="col">Last update</th>
          </tr>
        </thead>
        <tbody>
          {items.map((d) => {
            const status = statusOf(d.status)
            return (
              // Only the case id opens a case (a real button: works with mouse and keyboard).
              <tr key={d.id} className={openId === d.id ? 'selected' : ''}>
                <td>
                  <button
                    className="link mono"
                    data-open={d.id}
                    aria-current={openId === d.id}
                    onClick={() => onOpen(d.id)}
                  >
                    {d.id}
                  </button>
                </td>
                <td>{d.reason}</td>
                <td className="num strong">{formatMoney(d.amount)}</td>
                <td>
                  <span className={`pill ${status.tone}`}>{status.label}</span>
                </td>
                <td>{d.stage ?? '—'}</td>
                <td>{formatDate(d.created)}</td>
                <td className="muted">{formatAgo(d.updated)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

type ListProps = { items: DisputeSummary[]; openId: string | null; onOpen: (id: string) => void }

const needsReply = (d: DisputeSummary) => Number(d.status === 'WAITING_FOR_SELLER_RESPONSE')

type DisputeListProps = { openId: string | null; roomy: boolean; onOpen: (id: string) => void }

function DisputeList({ openId, roomy, onOpen }: DisputeListProps) {
  const [disputes, setDisputes] = useState<DisputeSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')
  const [category, setCategory] = useState<string | null>(null)
  const [view, setView] = useView()
  const narrow = useNarrow()
  // A table needs room: phones, and a narrow list beside an open case, get cards.
  const asTable = view === 'list' && !narrow && (!openId || roomy)

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
      <div className="toolbar">
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
        {!narrow && (!openId || roomy) && (
          <div className="segmented" role="group" aria-label="Layout">
            <button aria-pressed={view === 'list'} onClick={() => setView('list')} title="List view">
              <ListIcon />
              <span>List</span>
            </button>
            <button aria-pressed={view === 'grid'} onClick={() => setView('grid')} title="Grid view">
              <GridIcon />
              <span>Grid</span>
            </button>
          </div>
        )}
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
        asTable ? (
          <DisputeTable items={shown} openId={openId} onOpen={onOpen} />
        ) : (
          <DisputeCards items={shown} openId={openId} onOpen={onOpen} />
        )
      )}
    </>
  )
}

// Tiny hash router: "#/case/<id>" opens a case, anything else shows the list.
const caseIdFromHash = () => {
  const m = location.hash.match(/^#\/case\/(.+)$/)
  return m ? decodeURIComponent(m[1]) : null
}

function useListWidth(): [number, (w: number) => void] {
  const [w, setW] = useState(() => {
    try {
      return Number(localStorage.getItem('listWidth')) || LIST_DEFAULT
    } catch {
      return LIST_DEFAULT
    }
  })
  const save = (next: number) => {
    setW(next)
    try {
      localStorage.setItem('listWidth', String(next))
    } catch {
      /* private mode: keep it for this visit only */
    }
  }
  return [w, save]
}

const TABLE_MIN = 860 // list width at which the whole table fits beside an open case

export default function App() {
  const [openId, setOpenId] = useState<string | null>(caseIdFromHash)
  const [listWidth, setListWidth] = useListWidth()
  const layout = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onHash = () => setOpenId(caseIdFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Closing returns keyboard focus to the dispute that was open (after the list re-renders).
  const close = useCallback(() => {
    const id = openId
    location.hash = ''
    setTimeout(() => document.querySelector<HTMLElement>(`[data-open="${id}"]`)?.focus(), 50)
  }, [openId])

  // Esc closes the open case, like closing a side panel.
  useEffect(() => {
    if (!openId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId, close])

  return (
    <div className="app">
      <a className="skip" href="#disputes">
        Skip to disputes
      </a>
      <header className="topbar">
        <img src="/favicon.svg" alt="" />
        <h1>Dispute Copilot</h1>
        <span className="tag">PayPal sandbox</span>
        <ThemeToggle />
      </header>
      {/* No case open: list uses the full width. Case open: list left, case panel right
          with a close button (on phones the panel covers the screen). See index.css. */}
      <div
        ref={layout}
        className={`layout ${openId ? 'has-case' : ''}`}
        style={{ '--list-w': `${listWidth}px` } as React.CSSProperties}
      >
        <aside className="list-pane">
          <h2 className="section-title" id="disputes" tabIndex={-1}>
            Disputes
          </h2>
          <DisputeList
            openId={openId}
            roomy={listWidth >= TABLE_MIN}
            onOpen={(id) => (location.hash = `/case/${encodeURIComponent(id)}`)}
          />
        </aside>
        {openId && <Splitter width={listWidth} onChange={setListWidth} container={layout} />}
        {openId && (
          <main className="case-pane">
            <CaseView key={openId} id={openId} onClose={close} />
          </main>
        )}
      </div>
    </div>
  )
}
