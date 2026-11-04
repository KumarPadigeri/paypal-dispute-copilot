import { useEffect, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Column, GridApi } from 'ag-grid-community'
import { ColumnsIcon } from './icons'
import { FIXED_COLS, resetLayout, saveLayout } from './gridLayout'
import { usePopup } from './popup'

/**
 * In the list toolbar while the grid shows: a button that opens a list of columns to show or hide,
 * and "Reset layout" (order, widths, sort and hidden columns back to the defaults).
 * The case id always stays.
 */
export default function ColumnsMenu({ api }: { api: GridApi }) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const at = usePopup(open, setOpen, button, popup, 240)
  // redraw when columns are shown, hidden or moved (also by Reset)
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    const events = ['columnVisible', 'columnMoved', 'gridColumnsChanged'] as const
    events.forEach((e) => api.addEventListener(e, redraw))
    return () => events.forEach((e) => api.removeEventListener(e, redraw))
  }, [api])

  const columns = (api.getAllGridColumns() ?? []).filter((c: Column) => !FIXED_COLS.includes(c.getColId()))
  const shown = columns.filter((c) => c.isVisible()).length

  return (
    <>
      <button
        ref={button}
        type="button"
        className="icon-btn"
        aria-label="Show or hide columns"
        data-tip="Columns"
        data-tip-align="end"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <ColumnsIcon />
      </button>
      {open &&
        at &&
        createPortal(
          <div ref={popup} className="day-popup columns-popup" role="dialog" aria-label="Columns" style={at}>
            <fieldset>
              <legend className="tile-label">Columns</legend>
              {columns.map((c, i) => (
                <label key={c.getColId()} className="columns-item">
                  <input
                    type="checkbox"
                    autoFocus={i === 0}
                    checked={c.isVisible()}
                    // keep at least one column besides the case id
                    disabled={c.isVisible() && shown === 1}
                    onChange={(e) => {
                      api.setColumnsVisible([c], e.target.checked)
                      saveLayout(api.getState()) // at once: the grid's own save comes a moment later
                      redraw() // the grid applies it at once; redraw now, so the box never flips back
                    }}
                  />
                  {c.getColDef().headerName}
                </label>
              ))}
            </fieldset>
            <button
              type="button"
              className="btn columns-reset"
              onClick={() => {
                resetLayout(api)
                setOpen(false)
                button.current?.focus()
              }}
            >
              Reset layout
            </button>
          </div>,
          document.body,
        )}
    </>
  )
}
