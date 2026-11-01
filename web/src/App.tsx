import { useCallback, useEffect, useRef, useState } from 'react'
import CaseView from './CaseView'
import DisputeList from './DisputeList'
import Splitter, { LIST_DEFAULT } from './Splitter'
import ThemeToggle from './ThemeToggle'

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
  const layout = useRef<HTMLElement>(null)

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
        <img src="/favicon.svg?v=2" alt="" />
        <h1>Dispute Copilot</h1>
        <span className="tag">PayPal sandbox</span>
        <ThemeToggle />
      </header>
      {/* No case open: list uses the full width. Case open: list left, case panel right
          with a close button (on phones the panel covers the screen). See index.css. */}
      {/* One <main> always (list and case are labelled sections inside it), so screen-reader
          users can jump straight to the content and nothing sits outside a landmark. */}
      <main
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
            roomy={listWidth >= TABLE_MIN}
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
    </div>
  )
}
