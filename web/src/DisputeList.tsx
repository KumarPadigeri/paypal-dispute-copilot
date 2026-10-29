import { useEffect, useState } from 'react'
import { GridIcon, ListIcon } from './icons'
import {
  type DisputeSummary,
  formatAgo,
  formatDate,
  formatDateTime,
  formatMoney,
  listDisputes,
  listReasons,
} from './api'
import { ListSkeleton } from './Skeleton'
import StatusPill from './StatusPill'
import { GROUPS, type Group, statusOf } from './status'

const PAGE_SIZES = [10, 20, 50, 0] // 0 = all rows

/** Rows per page, remembered in this browser (works without storage too). */
function usePageSize(): [number, (n: number) => void] {
  const [size, setSize] = useState(() => {
    try {
      const n = Number(localStorage.getItem('pageSize'))
      return PAGE_SIZES.includes(n) && localStorage.getItem('pageSize') !== null ? n : 10
    } catch {
      return 10
    }
  })
  const save = (n: number) => {
    setSize(n)
    try {
      localStorage.setItem('pageSize', String(n))
    } catch {
      /* private mode: keep it for this visit only */
    }
  }
  return [size, save]
}

// Status filters use the same words, icons and colors as the status pills (see status.ts).
// They are toggles: click one to filter, click it again to show every dispute.
const FILTERS = Object.keys(GROUPS) as Group[]
const matches = (filter: 'all' | Group, d: DisputeSummary) =>
  filter === 'all' || statusOf(d.status).group === filter

// What an empty filter means, in plain words.
const EMPTY: Record<'all' | Group, string> = {
  all: 'No disputes. Nice.',
  reply: "You're all caught up. Nothing needs your reply.",
  waiting: 'Nothing is waiting on the buyer or PayPal.',
  resolved: 'No resolved disputes yet.',
}

type SortKey = 'amount' | 'created' | 'updated'
type Sort = { key: SortKey; desc: boolean } | null
const SORT_VALUE: Record<SortKey, (d: DisputeSummary) => number> = {
  amount: (d) => Number(d.amount?.value ?? 0),
  created: (d) => (d.created ? Date.parse(d.created) : 0),
  updated: (d) => (d.updated ? Date.parse(d.updated) : 0),
}

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

type ItemsProps = { items: DisputeSummary[]; openId: string | null; onOpen: (id: string) => void }

function DisputeCards({ items, openId, onOpen }: ItemsProps) {
  return (
    <div className="list">
      {items.map((d) => (
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
            <StatusPill status={d.status} />
          </span>
        </button>
      ))}
    </div>
  )
}

type TableProps = ItemsProps & { sort: Sort; onSort: (key: SortKey) => void }

function DisputeTable({ items, openId, onOpen, sort, onSort }: TableProps) {
  const header = (key: SortKey, label: string, num = false) => (
    <th
      scope="col"
      className={num ? 'num' : undefined}
      aria-sort={sort?.key === key ? (sort.desc ? 'descending' : 'ascending') : undefined}
    >
      <button className="th-sort" onClick={() => onSort(key)}>
        {label}
        <span className="arrow" aria-hidden="true">
          {sort?.key === key ? (sort.desc ? '▼' : '▲') : ''}
        </span>
      </button>
    </th>
  )

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Case</th>
            <th scope="col">Reason</th>
            {header('amount', 'Amount', true)}
            <th scope="col">Status</th>
            <th scope="col">Stage</th>
            {header('created', 'Opened')}
            {header('updated', 'Last update')}
          </tr>
        </thead>
        <tbody>
          {items.map((d) => (
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
                <StatusPill status={d.status} />
              </td>
              <td>{d.stage ?? '—'}</td>
              <td>{formatDate(d.created)}</td>
              <td className="muted">
                <span data-tip={formatAgo(d.updated)}>{formatDateTime(d.updated)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Footer({ page, pages, from, to, total, onPage, pageSize, onPageSize }: {
  page: number
  pages: number
  from: number
  to: number
  total: number
  onPage: (p: number) => void
  pageSize: number
  onPageSize: (n: number) => void
}) {
  return (
    <div className="list-footer">
      <span aria-live="polite">
        Showing {from}–{to} of {total}
      </span>
      <nav className="pager" aria-label="Pages">
        <label className="rows-label">
          Rows
          <select className="select small" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? 'All' : n}
              </option>
            ))}
          </select>
        </label>
        <button className="icon-btn small" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
          ‹
        </button>
        <span>
          Page {page} of {pages}
        </span>
        <button className="icon-btn small" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page">
          ›
        </button>
      </nav>
    </div>
  )
}

const needsReplyFirst = (a: DisputeSummary, b: DisputeSummary) =>
  Number(statusOf(b.status).group === 'reply') - Number(statusOf(a.status).group === 'reply')

type Props = { openId: string | null; roomy: boolean; onOpen: (id: string) => void }

export default function DisputeList({ openId, roomy, onOpen }: Props) {
  const [disputes, setDisputes] = useState<DisputeSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | Group>('all')
  const [reason, setReason] = useState('')
  const [sort, setSort] = useState<Sort>(null) // none picked: cases needing a reply first
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = usePageSize()
  const [view, setView] = useView()
  const narrow = useNarrow()
  // A table needs room: phones, and a narrow list beside an open case, get cards.
  const asTable = view === 'list' && !narrow && (!openId || roomy)

  const [allReasons, setAllReasons] = useState<string[]>([])

  useEffect(() => {
    listDisputes().then((list) => setDisputes([...list].sort(needsReplyFirst)), (e: Error) => setError(e.message))
    listReasons().then(setAllReasons, () => setAllReasons([])) // the dropdown still works from the cases
  }, [])

  if (error) return <div className="notice error">Could not load disputes from PayPal ({error}).</div>
  if (!disputes) return <ListSkeleton />

  // PayPal's full reason list (in PayPal's order), plus any reason a case has that the list lacks.
  const reasons = [...new Set([...allReasons, ...disputes.map((d) => d.reason)])]
  const reasonCount = (r: string) => disputes.filter((d) => d.reason === r).length
  const filtered = disputes.filter((d) => matches(filter, d) && (!reason || d.reason === reason))
  const sorted = sort
    ? [...filtered].sort((a, b) => (SORT_VALUE[sort.key](a) - SORT_VALUE[sort.key](b)) * (sort.desc ? -1 : 1))
    : filtered
  const size = pageSize || sorted.length || 1 // "All" = one page with every row
  const pages = Math.max(1, Math.ceil(sorted.length / size))
  const current = Math.min(page, pages)
  const shown = sorted.slice((current - 1) * size, current * size)

  const pickFilter = (f: 'all' | Group) => {
    setFilter(f)
    setPage(1)
  }
  // First click on a column: newest / largest first; next click flips it.
  const onSort = (key: SortKey) => {
    setSort(sort?.key === key ? { key, desc: !sort.desc } : { key, desc: true })
    setPage(1)
  }

  return (
    <>
      <div className="toolbar">
        <div className="toolbar-left">
          {reasons.length > 1 && (
            <label className="select-label">
              <span className="sr-only">Reason</span>
              <select
                className="select"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">All reasons ({disputes.length})</option>
                {reasons.map((r) => (
                  <option key={r} value={r} disabled={reasonCount(r) === 0}>
                    {r} ({reasonCount(r)})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="chips" role="group" aria-label="Filter by status">
          {FILTERS.map((g) => {
            const group = GROUPS[g]
            const on = filter === g
            return (
              <button
                key={g}
                className={`chip tone-${group.tone} ${on ? 'on' : ''}`}
                aria-pressed={on}
                onClick={() => pickFilter(on ? 'all' : g)}
              >
                <group.Icon />
                {group.label}
                <span className="count">{disputes.filter((d) => matches(g, d)).length}</span>
              </button>
            )
          })}
        </div>
        <div className="toolbar-right">
          {!narrow && (!openId || roomy) && (
            <div className="segmented" role="group" aria-label="Layout">
              <button aria-pressed={view === 'list'} aria-label="List view" data-tip="List view" onClick={() => setView('list')}>
                <ListIcon />
              </button>
              <button aria-pressed={view === 'grid'} aria-label="Grid view" data-tip="Grid view" onClick={() => setView('grid')}>
                <GridIcon />
              </button>
            </div>
          )}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="notice empty-state">
          <p>{disputes.length === 0 ? EMPTY.all : reason ? 'No results.' : EMPTY[filter]}</p>
          {disputes.length > 0 && (
            <button
              className="link"
              onClick={() => {
                pickFilter('all')
                setReason('')
              }}
            >
              Show all disputes
            </button>
          )}
        </div>
      ) : (
        <>
          {asTable ? (
            <DisputeTable items={shown} openId={openId} onOpen={onOpen} sort={sort} onSort={onSort} />
          ) : (
            <DisputeCards items={shown} openId={openId} onOpen={onOpen} />
          )}
          <Footer
            page={current}
            pages={pages}
            from={(current - 1) * size + 1}
            to={(current - 1) * size + shown.length}
            total={sorted.length}
            onPage={setPage}
            pageSize={pageSize}
            onPageSize={(n) => {
              setPageSize(n)
              setPage(1)
            }}
          />
        </>
      )}
    </>
  )
}
