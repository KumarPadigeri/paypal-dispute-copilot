import { useEffect, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Column, IHeaderParams } from 'ag-grid-community'
import { ColumnsIcon } from './icons'
import { usePopup } from './popup'

/**
 * The grid's top-left corner: a button that opens a list of columns to show or hide, and
 * "Reset layout" (order, widths, sort and hidden columns back to the defaults).
 * `fixed` columns (the case id, the corner itself) always stay.
 */
export default function ColumnsMenu(props: IHeaderParams & { fixed: string[]; onReset: () => void }) {
  const { api, fixed, onReset } = props
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

  // Keyboard: the grid focuses the header cell itself, so Enter or Space there opens the menu
  useEffect(() => {
    const cell = props.eGridHeader
    const onKey = (e: KeyboardEvent) => {
      if (e.target === cell && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        setOpen(true)
      }
    }
    cell.addEventListener('keydown', onKey)
    return () => cell.removeEventListener('keydown', onKey)
  }, [props.eGridHeader])

  const columns = (api.getAllGridColumns() ?? []).filter((c: Column) => !fixed.includes(c.getColId()))
  const shown = columns.filter((c) => c.isVisible()).length

  return (
    <>
      <button
        ref={button}
        type="button"
        className="icon-btn small grid-columns"
        aria-label="Show or hide columns"
        data-tip="Columns"
        data-tip-align="start"
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
                    onChange={(e) => api.setColumnsVisible([c], e.target.checked)}
                  />
                  {c.getColDef().headerName}
                </label>
              ))}
            </fieldset>
            <button
              type="button"
              className="btn columns-reset"
              onClick={() => {
                onReset()
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
