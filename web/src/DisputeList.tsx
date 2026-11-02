import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import {
  type DisputeSummary,
  formatDate,
  formatMoney,
  listDisputes,
  listReasons,
} from './api'
import Deadline from './Deadline'
import { downloadCsv } from './csv'
import { type Drill, drillFromHash, drillLabel, drillMatches } from './drill'
import Dashboard from './Dashboard'
import { CloseIcon, SearchIcon } from './icons'
import { ListSkeleton } from './Skeleton'
import StatusPill from './StatusPill'
import { GROUPS, type Group, statusOf } from './status'

// AG Grid is the biggest part of the app: it loads the first time the grid view is shown
const DisputeGrid = lazy(() => import('./DisputeGrid'))

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
// They are toggles and can be combined (e.g. Waiting + Resolved); none picked shows every dispute.
const FILTERS = Object.keys(GROUPS) as Group[]
const matches = (picked: Group[], d: DisputeSummary) =>
  picked.length === 0 || picked.includes(statusOf(d.status).group as Group)

// What an empty filter means, in plain words.
const EMPTY: Record<'all' | Group, string> = {
  all: 'No disputes. Nice.',
  reply: "You're all caught up. Nothing needs your reply.",
  waiting: 'Nothing is waiting on the buyer or PayPal.',
  resolved: 'No resolved disputes yet.',
}

const dueTime = (d: DisputeSummary) => (d.respond_by ? Date.parse(d.respond_by) : Number.MAX_SAFE_INTEGER)


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
          {statusOf(d.status).group === 'reply' && d.respond_by && (
            <span className="card-due">
              <Deadline iso={d.respond_by} />
            </span>
          )}
          <span className="pills">
            <span className="pill category">{d.reason}</span>
            <StatusPill status={d.status} />
          </span>
        </button>
      ))}
    </div>
  )
}

function Footer({ page, pages, from, to, total, all, onPage, pageSize, onPageSize }: {
  page: number
  pages: number
  from: number
  to: number
  total: number // rows that match the filters
  all: number // every dispute, before filtering
  onPage: (p: number) => void
  pageSize: number
  onPageSize: (n: number) => void
}) {
  return (
    <div className="list-footer">
      <span aria-live="polite">
        {/* A range only when rows are on other pages; the overall total only when a filter hides some */}
        {total === 0
          ? `Showing 0 of ${all}`
          : from === 1 && to === total
          ? total === all
            ? `Showing all ${all}`
            : `Showing ${total} of ${all}`
          : `Showing ${from}–${to} of ${total}${total < all ? ` (${all} in total)` : ''}`}
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

// Default order: cases that need a reply first, the soonest deadline at the top.
const needsReplyFirst = (a: DisputeSummary, b: DisputeSummary) =>
  Number(statusOf(b.status).group === 'reply') - Number(statusOf(a.status).group === 'reply') ||
  dueTime(a) - dueTime(b)

type Props = {
  openId: string | null
  asTable: boolean
  onOpen: (id: string) => void
  onExport: (exportCsv: (() => void) | null) => void // the header's export button, while the grid shows
}

export default function DisputeList({ openId, asTable, onOpen, onExport }: Props) {
  const [disputes, setDisputes] = useState<DisputeSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<Group[]>([]) // status chips that are on
  // A drill-down from Insights ("#/?reason=…"), kept while cases open and close; removed by its ✕
  const [drill, setDrill] = useState<Drill | null>(() => drillFromHash())
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = usePageSize()

  const [allReasons, setAllReasons] = useState<string[]>([])
  const [gridCount, setGridCount] = useState<number | null>(null) // rows left after the grid's column filters

  useEffect(() => {
    const onHash = () => {
      const next = drillFromHash()
      if (!next) return
      setDrill(next)
      setPicked([]) // a fresh drill-down starts from just that filter
      setSearch('')
      setPage(1)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Export: the grid hands up AG Grid's own export; cards export what the chips and search leave
  const cardRows = useRef<DisputeSummary[]>([])
  useEffect(() => {
    if (!asTable) onExport(() => downloadCsv(cardRows.current))
  }, [asTable, onExport])

  useEffect(() => {
    listDisputes().then((list) => setDisputes([...list].sort(needsReplyFirst)), (e: Error) => setError(e.message))
    listReasons().then(setAllReasons, () => setAllReasons([])) // the grid's reason dropdown still works from the cases
  }, [])

  if (error) return <div className="notice error">Could not load disputes from PayPal ({error}).</div>
  if (!disputes) return <ListSkeleton asTable={asTable} />

  // PayPal's full reason list (in PayPal's order), plus any reason a case has that the list lacks.
  const reasons = [...new Set([...allReasons, ...disputes.map((d) => d.reason)])]
  const filtered = disputes.filter((d) => matches(picked, d) && (!drill || drillMatches(drill, d)))
  // Search: AG Grid's quick filter in the grid; the same words over the same fields for cards
  const q = search.trim().toLowerCase()
  const found = filtered.filter(
    (d) =>
      !q ||
      [d.id, d.reason, statusOf(d.status).label, d.stage ?? '', formatMoney(d.amount)]
        .join(' ')
        .toLowerCase()
        .includes(q),
  )
  // The grid can narrow the rows further with its own column filters
  const total = asTable && gridCount !== null ? gridCount : found.length
  const size = pageSize || total || 1 // "All" = one page with every row
  const pages = Math.max(1, Math.ceil(total / size))
  const current = Math.min(page, pages)
  const shown = found.slice((current - 1) * size, current * size) // cards page here; the grid pages itself
  cardRows.current = found
  const onPage = Math.max(0, Math.min(size, total - (current - 1) * size))

  const toggle = (g: Group) => {
    setPicked((on) => (on.includes(g) ? on.filter((x) => x !== g) : FILTERS.filter((x) => x === g || on.includes(x))))
    setPage(1)
  }

  return (
    <>
      {!openId && (
        <Dashboard disputes={disputes} />
      )}
      {/* Status chips, then a full-width search under them */}
      <div className="filters">
        <div className="chips" role="group" aria-label="Filter by status">
          {FILTERS.map((g) => {
            const group = GROUPS[g]
            const on = picked.includes(g)
            return (
              <button
                key={g}
                className={`chip tone-${group.tone} ${on ? 'on' : ''}`}
                aria-pressed={on}
                onClick={() => toggle(g)}
              >
                <group.Icon />
                {group.label}
                <span className="count">{disputes.filter((d) => matches([g], d)).length}</span>
              </button>
            )
          })}
        </div>
        <label className="search">
          <SearchIcon />
          <span className="sr-only">Search disputes</span>
          <input
            type="search"
            placeholder="Search by case, reason, status or amount"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
          {search && (
            <button
              type="button"
              className="search-clear"
              aria-label="Clear search"
              onClick={() => {
                setSearch('')
                setPage(1)
              }}
            >
              <CloseIcon />
            </button>
          )}
        </label>
        {drill && (
          <p className="drill-tag">
            <span>
              From Insights: <strong>{drillLabel(drill)}</strong>
            </span>
            <button
              type="button"
              className="search-clear"
              aria-label={`Remove filter ${drillLabel(drill)}`}
              onClick={() => {
                setDrill(null)
                setPage(1)
                if (drillFromHash()) location.hash = ''
              }}
            >
              <CloseIcon />
            </button>
          </p>
        )}
      </div>

      {(asTable ? filtered.length === 0 : shown.length === 0) ? (
        <div className="notice empty-state">
          <p>
            {disputes.length === 0
              ? EMPTY.all
              : q
                ? 'No results.'
                : picked.length === 1
                  ? EMPTY[picked[0]]
                  : 'No disputes with these statuses.'}</p>
          {disputes.length > 0 && (
            <button
              className="link"
              onClick={() => {
                setPicked([])
                setSearch('')
                setDrill(null)
              }}
            >
              Show all disputes
            </button>
          )}
        </div>
      ) : (
        <>
          {asTable ? (
            <Suspense fallback={<ListSkeleton asTable />}>
              <DisputeGrid
              items={filtered}
              reasons={reasons}
              search={search}
              page={current}
              pageSize={pageSize}
              openId={openId}
              onOpen={onOpen}
              onCount={(n) => {
                setGridCount(n)
                setPage(1)
              }}
              onReady={onExport}
            />
            </Suspense>
          ) : (
            <DisputeCards items={shown} openId={openId} onOpen={onOpen} />
          )}
          <Footer
            page={current}
            pages={pages}
            from={(current - 1) * size + 1}
            to={(current - 1) * size + onPage}
            total={total}
            all={disputes.length}
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
