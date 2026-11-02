import { useEffect, useMemo, useRef } from 'react'
import {
  CellStyleModule,
  ClientSideRowModelModule,
  CsvExportModule,
  DateFilterModule,
  DragAndDropModule,
  GridStateModule,
  ModuleRegistry,
  NumberFilterModule,
  PaginationModule,
  QuickFilterModule,
  RowApiModule,
  RowSelectionModule,
  RowStyleModule,
  TextFilterModule,
  TooltipModule,
  ValidationModule,
  themeQuartz,
  type ColDef,
  type GridApi,
  type GridState,
  type ICellRendererParams,
} from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import Deadline from './Deadline'
import StatusPill from './StatusPill'
import { type DisputeSummary, formatAgo, formatDate, formatDateTime, formatMoney } from './api'
import { statusOf } from './status'

// Only free (Community) features: sorting, resizable and draggable columns, column filters, quick
// search, paging, row selection, tooltips, CSV export and a remembered layout. Validation (readable errors) in development only.
ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  PaginationModule,
  TextFilterModule,
  NumberFilterModule,
  DateFilterModule,
  QuickFilterModule,
  RowSelectionModule,
  RowApiModule,
  GridStateModule,
  CsvExportModule,
  TooltipModule,
  CellStyleModule,
  RowStyleModule,
  DragAndDropModule, // drag a header to move its column
  ...(import.meta.env.DEV ? [ValidationModule] : []),
])

// The seller's column order, widths, pinning and sort, remembered in this browser
const STATE_KEY = 'gridLayout'
function savedLayout(): GridState | undefined {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null') ?? undefined
  } catch {
    return undefined
  }
}
function saveLayout(state: GridState) {
  const { columnOrder, columnSizing, columnPinning, sort } = state
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({ columnOrder, columnSizing, columnPinning, sort }))
  } catch {
    /* private mode: layout lasts this visit only */
  }
}

// AG Grid's Quartz theme drawn with our own color tokens, so light and dark follow the app.
const theme = themeQuartz.withParams({
  fontFamily: 'inherit',
  fontSize: 14,
  backgroundColor: 'var(--surface)',
  foregroundColor: 'var(--text)',
  textColor: 'var(--text)',
  subtleTextColor: 'var(--muted)',
  borderColor: 'var(--border)',
  accentColor: 'var(--accent)',
  headerBackgroundColor: 'var(--surface-2)',
  headerTextColor: 'var(--muted)',
  headerFontWeight: 600,
  headerFontSize: 12,
  rowHoverColor: 'color-mix(in srgb, var(--accent) 9%, transparent)',
  oddRowBackgroundColor: 'color-mix(in srgb, var(--surface-2) 45%, transparent)',
  selectedRowBackgroundColor: 'var(--surface-2)',
  menuBackgroundColor: 'var(--surface)',
  inputBorder: { color: 'var(--border-strong)' },
  wrapperBorder: false,
  wrapperBorderRadius: 0,
  columnBorder: false,
  rowHeight: 46,
  headerHeight: 42,
  cellHorizontalPadding: 14,
})

const time = (iso: string | null) => (iso ? new Date(iso) : null)
const byTime = (a: Date | null, b: Date | null) =>
  (a ? a.getTime() : Number.MAX_SAFE_INTEGER) - (b ? b.getTime() : Number.MAX_SAFE_INTEGER)
const onDate = (filterDate: Date, cell: Date | null) => {
  if (!cell) return -1
  const day = new Date(cell.getFullYear(), cell.getMonth(), cell.getDate()).getTime()
  return day === filterDate.getTime() ? 0 : day < filterDate.getTime() ? -1 : 1
}
const dateFilter = { filter: 'agDateColumnFilter', filterParams: { comparator: onDate } } as const

type Props = {
  items: DisputeSummary[] // every row that matches the chips and reason; the grid sorts, filters and pages them
  search: string // the toolbar's search box, applied by AG Grid's quick filter
  page: number
  pageSize: number // 0 = all
  openId: string | null
  onOpen: (id: string) => void
  onCount: (shown: number) => void // rows left after the grid's own column filters
  onReady: (exportCsv: () => void) => void
}

export default function DisputeGrid({ items, search, page, pageSize, openId, onOpen, onCount, onReady }: Props) {
  const api = useRef<GridApi<DisputeSummary> | null>(null)

  const columns = useMemo<ColDef<DisputeSummary>[]>(
    () => [
      {
        headerName: 'Case',
        field: 'id',
        minWidth: 180,
        pinned: 'left', // stays in view when the table scrolls sideways
        filter: 'agTextColumnFilter',
        // Only the case id opens a case (a real button: works with mouse and keyboard)
        cellRenderer: (p: ICellRendererParams<DisputeSummary>) =>
          p.data && (
            <button
              className="link mono"
              data-open={p.data.id}
              aria-current={openId === p.data.id}
              onClick={() => onOpen(p.data!.id)}
            >
              {p.data.id}
            </button>
          ),
        suppressKeyboardEvent: (p) => p.event.key === 'Enter', // let Enter press the button
      },
      { headerName: 'Reason', field: 'reason', flex: 1, minWidth: 170, filter: 'agTextColumnFilter' },
      {
        headerName: 'Amount',
        colId: 'amount',
        valueGetter: (p) => Number(p.data?.amount?.value ?? 0),
        valueFormatter: (p) => formatMoney(p.data?.amount ?? null),
        filter: 'agNumberColumnFilter',
        cellClass: 'center strong',
        headerClass: 'center',
        minWidth: 120,
      },
      {
        headerName: 'Status',
        colId: 'status',
        valueGetter: (p) => statusOf(p.data?.status ?? '').label,
        cellRenderer: (p: ICellRendererParams<DisputeSummary>) => p.data && <StatusPill status={p.data.status} />,
        filter: 'agTextColumnFilter',
        cellClass: 'center',
        headerClass: 'center',
        minWidth: 140,
      },
      {
        headerName: 'Reply by',
        colId: 'due',
        // Only cases that need a reply have a deadline that matters
        valueGetter: (p) => (p.data && statusOf(p.data.status).group === 'reply' ? time(p.data.respond_by) : null),
        valueFormatter: (p) => (p.value ? formatDate(p.data?.respond_by ?? null) : '—'),
        cellRenderer: (p: ICellRendererParams<DisputeSummary>) =>
          p.value ? <Deadline iso={p.data?.respond_by} label="" /> : <span className="muted">—</span>,
        comparator: byTime,
        ...dateFilter,
        cellClass: 'center',
        headerClass: 'center',
        minWidth: 190,
      },
      {
        headerName: 'Stage',
        colId: 'stage',
        valueGetter: (p) => p.data?.stage ?? '—',
        filter: 'agTextColumnFilter',
        cellClass: 'center',
        headerClass: 'center',
        minWidth: 110,
      },
      {
        headerName: 'Opened',
        colId: 'created',
        valueGetter: (p) => time(p.data?.created ?? null),
        valueFormatter: (p) => formatDate(p.data?.created ?? null),
        comparator: byTime,
        ...dateFilter,
        minWidth: 140,
      },
      {
        headerName: 'Last update',
        colId: 'updated',
        valueGetter: (p) => time(p.data?.updated ?? null),
        valueFormatter: (p) => formatDateTime(p.data?.updated ?? null),
        tooltipValueGetter: (p) => formatAgo(p.data?.updated ?? null),
        comparator: byTime,
        ...dateFilter,
        cellClass: 'muted',
        minWidth: 170,
      },
    ],
    [openId, onOpen],
  )

  // Our footer drives the paging, so card and grid views page the same way
  useEffect(() => {
    api.current?.paginationGoToPage(page - 1)
  }, [page, pageSize])

  return (
    <div className="table-wrap grid-wrap">
      <AgGridReact<DisputeSummary>
        theme={theme}
        rowData={items}
        columnDefs={columns}
        defaultColDef={{ sortable: true, resizable: true, unSortIcon: true, flex: 1 }}
        getRowId={(p) => p.data.id}
        rowClassRules={{ selected: (p) => p.data?.id === openId }}
        rowSelection={{ mode: 'multiRow', checkboxes: true, headerCheckbox: true, enableClickSelection: false }}
        selectionColumnDef={{ pinned: 'left', width: 48, minWidth: 48, maxWidth: 48 }}
        quickFilterText={search}
        initialState={savedLayout()}
        onStateUpdated={(e) => saveLayout(e.state)}
        domLayout="autoHeight"
        pagination
        paginationPageSize={pageSize || Math.max(items.length, 1)}
        suppressPaginationPanel
        suppressCellFocus={false}
        tooltipShowDelay={300}
        overlayNoRowsTemplate="<span>No disputes match.</span>"
        onGridReady={(e) => {
          api.current = e.api
          // Picked rows only when some are ticked; otherwise every row the filters leave
          onReady(() =>
            e.api.exportDataAsCsv({ fileName: 'disputes.csv', onlySelected: e.api.getSelectedRows().length > 0 }),
          )
        }}
        onFilterChanged={(e) => onCount(e.api.getDisplayedRowCount())}
        onRowDataUpdated={(e) => onCount(e.api.getDisplayedRowCount())}
      />
    </div>
  )
}
