import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { GridApi } from 'ag-grid-community'
import CaseView from './CaseView'
import ColumnsMenu from './ColumnsMenu'
import DisputeList from './DisputeList'
import { InsightsSkeleton } from './Skeleton'
import Splitter, { LIST_DEFAULT } from './Splitter'
import ThemeToggle from './ThemeToggle'
import ViewToggle from './ViewToggle'
import { ChartIcon, DownloadIcon } from './icons'
import { useView, useNarrow } from './view'

// Insights (AG Charts) loads only when it is opened
const Insights = lazy(() => import('./Insights'))

// Tiny hash router: "#/insights" shows Insights, "#/case/<id>" opens a case, anything else the list.
const onInsights = () => location.hash === '#/insights'
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
  const [insights, setInsights] = useState(onInsights)
  const [listWidth, setListWidth] = useListWidth()
  const layout = useRef<HTMLElement>(null)
  const [view, setView] = useView()
  // A table needs room: phones, and a narrow list beside an open case, always get cards.
  const narrow = useNarrow()
  const tableFits = !narrow && (!openId || listWidth >= TABLE_MIN)
  // The grid hands up its CSV export while it is on screen (wrapped: setState would call a bare function)
  const [exportCsv, setExportCsv] = useState<(() => void) | null>(null)
  const onExport = useCallback((fn: (() => void) | null) => setExportCsv(() => fn), [])
  const [gridApi, setGridApi] = useState<GridApi | null>(null) // the grid, while it shows

  useEffect(() => {
    const onHash = () => {
      setOpenId(caseIdFromHash())
      setInsights(onInsights())
    }
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
      {/* Moves focus without touching the address (the address is our router) */}
      <a
        className="skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('main')?.focus()
        }}
      >
        Skip to content
      </a>
      <header className="topbar">
        <img src="/favicon.svg?v=2" alt="" />
        <h1>Dispute Copilot</h1>
        {/* The app's two screens, named, so neither is hidden behind an icon */}
        <nav className="tabs" aria-label="Screens">
          <a href="#" className={insights ? '' : 'on'} aria-current={insights ? undefined : 'page'}>
            Disputes
          </a>
          <a href="#/insights" className={insights ? 'on' : ''} aria-current={insights ? 'page' : undefined}>
            <ChartIcon />
            Insights
          </a>
        </nav>
        <span className="tag">PayPal sandbox</span>
        <ThemeToggle />
      </header>
      {/* No case open: list uses the full width. Case open: list left, case panel right
          with a close button (on phones the panel covers the screen). See index.css. */}
      {/* One <main> always (list and case are labelled sections inside it), so screen-reader
          users can jump straight to the content and nothing sits outside a landmark. */}
      {insights ? (
        <main className="insights-page" id="main" tabIndex={-1}>
          {/* same title and shapes as the loaded page, so nothing moves when it arrives */}
          <Suspense
            fallback={
              <section className="insights">
                <div className="insights-head">
                  <h2>Insights</h2>
                </div>
                <InsightsSkeleton />
              </section>
            }
          >
            <Insights />
          </Suspense>
        </main>
      ) : (
        <main
          id="main"
          tabIndex={-1}
          ref={layout}
          className={`layout ${openId ? 'has-case' : ''}`}
          style={{ '--list-w': `${listWidth}px` } as React.CSSProperties}
        >
          <section className="list-pane" aria-labelledby="disputes">
            <h2 className="sr-only" id="disputes" tabIndex={-1}>
              Disputes
            </h2>
            <DisputeList
              openId={openId}
              asTable={tableFits && view === 'list'}
              onExport={onExport}
              onGrid={setGridApi}
              // the list's own tools sit beside its status chips
              actions={
                <>
                  {gridApi && <ColumnsMenu api={gridApi} />}
                  {exportCsv && (
                    <button
                      className="icon-btn"
                      onClick={exportCsv}
                      aria-label="Export CSV"
                      data-tip="Export CSV"
                      data-tip-align="end"
                    >
                      <DownloadIcon />
                    </button>
                  )}
                  {tableFits && <ViewToggle view={view} onChange={setView} />}
                </>
              }
              onOpen={(id) => (location.hash = `/case/${encodeURIComponent(id)}`)}
            />
          </section>
          {openId && <Splitter width={listWidth} onChange={setListWidth} container={layout} />}
          {openId && (
            <section className="case-pane" aria-label="Dispute details">
              <CaseView key={openId} id={openId} onClose={close} />
            </section>
          )}
        </main>
      )}
    </div>
  )
}
