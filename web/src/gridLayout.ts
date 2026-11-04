// The grid's layout as the seller left it, remembered in this browser: column order, widths,
// pinning, sort and hidden columns. Shared by the grid and its Columns menu in the list toolbar.
import type { GridApi, GridState } from 'ag-grid-community'

const STATE_KEY = 'gridLayout'
export const CLEAR_COL = 'clearFilters' // the clear-all-filters corner column
export const FIXED_COLS = [CLEAR_COL, 'id'] // always shown: the corner and the case id

export function savedLayout(): GridState | undefined {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null') ?? undefined
  } catch {
    return undefined
  }
}

export function saveLayout(state: GridState) {
  const { columnOrder, columnSizing, columnPinning, sort, columnVisibility } = state
  try {
    localStorage.setItem(
      STATE_KEY,
      JSON.stringify({ columnOrder, columnSizing, columnPinning, sort, columnVisibility }),
    )
  } catch {
    /* private mode: layout lasts this visit only */
  }
}

/** Every column back to its default order, width, sort and visibility. */
export function resetLayout(api: GridApi) {
  api.resetColumnState()
  try {
    localStorage.removeItem(STATE_KEY)
  } catch {
    /* nothing saved */
  }
}
