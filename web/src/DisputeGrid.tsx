import { useEffect, useMemo, useRef, useState } from 'react'
import ColumnsMenu from './ColumnsMenu'
import DayFilter from './DayFilter'
import { CloseIcon } from './icons'
import {
  CellStyleModule,
  ClientSideRowModelModule,
  ColumnApiModule,
  CsvExportModule,
  DateFilterModule,
  DragAndDropModule,
  EventApiModule,
  GridStateModule,
  HighlightChangesModule,
  ModuleRegistry,
  PaginationModule,
  PinnedRowModule,
  QuickFilterModule,
  RowApiModule,
  RowStyleModule,
  TextFilterModule,
  TooltipModule,
  ValidationModule,
  themeQuartz,
  type ColDef,
  type GridApi,
  type GridState,
  type ICellRendererParams,
  type IFilter,
} from 'ag-grid-community'
import { AgGridReact, type CustomFloatingFilterProps } from 'ag-grid-react'
import Deadline from './Deadline'
import StatusPill from './StatusPill'
import { type DisputeSummary, formatAgo, formatDate, formatDateTime, formatMoney } from './api'
import { dueOf } from './due'
import { GROUPS, statusOf } from './status'

// Only free (Community) features: sorting, resizable and draggable columns, column filters, quick
// search, paging, tooltips, CSV export, a remembered layout, a pinned totals row and a flash when
// a status changes. Validation (readable errors) in development only.
ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  ColumnApiModule, // export leaves out the clear-all column
  PaginationModule,
  TextFilterModule,
  DateFilterModule, // calendar pickers for Opened, Reply by and Last update
  QuickFilterModule,
  RowApiModule,
  EventApiModule, // the clear-all button listens for filter changes
  GridStateModule,
  CsvExportModule,
  TooltipModule,
  CellStyleModule,
  RowStyleModule,
  DragAndDropModule, // drag a header to move its column
  PinnedRowModule, // the totals row under the rows
  HighlightChangesModule, // a status cell flashes when PayPal reports a change
  ...(import.meta.env.DEV ? [ValidationModule] : []),
])

// The seller's column order, widths, pinning, sort and hidden columns, remembered in this browser
const STATE_KEY = 'gridLayout'
const CLEAR_COL = 'clearFilters'
function savedLayout(): GridState | undefined {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null') ?? undefined
  } catch {
    return undefined
  }
}
function saveLayout(state: GridState) {
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

// The totals row: how many disputes the filters leave and the money in them (one currency only)
type Total = DisputeSummary & { count: number }
function totalOf(rows: DisputeSummary[]): Total {
  const currencies = new Set(rows.flatMap((d) => (d.amount ? [d.amount.currency_code] : [])))
  const currency = currencies.size === 1 ? [...currencies][0] : null
  const sum = rows.reduce((s, d) => s + Number(d.amount?.value ?? 0), 0)
  return {
    id: '__total',
    count: rows.length,
    status: '',
    reason: '',
    amount: currency ? { currency_code: currency, value: sum.toFixed(2) } : null,
    created: null,
    updated: null,
    stage: null,
    respond_by: null,
  }
}

// A colored left edge on rows whose reply is due soon: red at 2 days or fewer, amber at 5
const dueTone = (d?: DisputeSummary) =>
  d && statusOf(d.status).group === 'reply' ? dueOf(d.respond_by)?.tone : undefined

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

// The filter row under the headers: type and it matches when the cell contains the text
// (no "equals / starts with" menu). Amount and dates match on the text you see. Each filter is
// our own small input with a clear button, driving AG Grid's built-in text filter.
type TextModel = { filterType: 'text'; type: 'contains' | 'equals'; filter: string } | null
type FilterCellProps = CustomFloatingFilterProps<IFilter, DisputeSummary, unknown, TextModel> & { label: string }

// "Clear all filters" resets the grid's filters and tells every filter cell to empty its box
const CLEAR_ALL = 'dispute-grid:clear-all'
function useClearAll(reset: () => void) {
  useEffect(() => {
    window.addEventListener(CLEAR_ALL, reset)
    return () => window.removeEventListener(CLEAR_ALL, reset)
  })
}

function ClearOne({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button type="button" className="grid-clear" aria-label={`Clear ${label} filter`} onClick={onClear}>
      <CloseIcon />
    </button>
  )
}

function ContainsFloatingFilter(props: FilterCellProps) {
  const [text, setText] = useState(props.model?.filter ?? '')
  useClearAll(() => setText(''))
  useEffect(() => {
    const t = setTimeout(() => {
      const value = text.trim()
      if (value !== (props.model?.filter ?? '')) props.onModelChange(value ? { filterType: 'text', type: 'contains', filter: value } : null)
    }, 150)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])
  return (
    <span className="grid-filter">
      <input aria-label={`${props.label} filter`} value={text} onChange={(e) => setText(e.target.value)} />
      {text && <ClearOne label={props.label} onClear={() => setText('')} />}
    </span>
  )
}

// Date columns: a calendar button (DayFilter) in the filter row, matching the day in local time
type DateModel = { filterType: 'date'; type: 'equals'; dateFrom: string } | null
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} 00:00:00`
const fromModel = (m: DateModel) => {
  if (!m?.dateFrom) return null
  const [y, mo, d] = m.dateFrom.slice(0, 10).split('-').map(Number)
  return new Date(y, mo - 1, d)
}
function DateFloatingFilter(props: CustomFloatingFilterProps<IFilter, DisputeSummary, unknown, DateModel> & { label: string }) {
  const [day, setDay] = useState<Date | null>(fromModel(props.model))
  useClearAll(() => setDay(null))
  const pick = (d: Date | null) => {
    setDay(d)
    props.onModelChange(d ? { filterType: 'date', type: 'equals', dateFrom: ymd(d) } : null)
  }
  return (
    <span className="grid-filter">
      <DayFilter label={props.label} day={day} onPick={pick} />
      {day && <ClearOne label={props.label} onClear={() => pick(null)} />}
    </span>
  )
}
const sameDay = (picked: Date, cell: Date | null) => {
  if (!cell) return -1
  const d = new Date(cell.getFullYear(), cell.getMonth(), cell.getDate()).getTime()
  return d === picked.getTime() ? 0 : d < picked.getTime() ? -1 : 1
}
const dateFilter = (label: string) =>
  ({
    filter: 'agDateColumnFilter',
    filterParams: { comparator: sameDay, filterOptions: ['equals'], maxNumConditions: 1 },
    floatingFilter: true,
    floatingFilterComponent: DateFloatingFilter,
    floatingFilterComponentParams: { label },
    suppressHeaderFilterButton: true,
    suppressFloatingFilterButton: true,
  }) as const

const containsFilter = (label: string) =>
  ({
    filter: 'agTextColumnFilter',
    filterParams: { filterOptions: ['contains'], maxNumConditions: 1 },
    floatingFilter: true,
    floatingFilterComponent: ContainsFloatingFilter,
    floatingFilterComponentParams: { label },
    suppressHeaderFilterButton: true,
    suppressFloatingFilterButton: true,
  }) as const

// Status and Reason have a fixed list of values, so their filter is a dropdown. It drives AG Grid's
// own text filter set to "equals" (built-in filters are always there, so a pick always applies).
function PickFloatingFilter(props: FilterCellProps & { options: string[] }) {
  const [value, setValue] = useState(props.model?.filter ?? '')
  useClearAll(() => setValue(''))
  const pick = (v: string) => {
    setValue(v)
    props.onModelChange(v ? { filterType: 'text', type: 'equals', filter: v } : null)
  }
  return (
    <span className="grid-filter">
      <select
        className="grid-pick"
        aria-label={`${props.label} filter`}
        value={value}
        onChange={(e) => pick(e.target.value)}
      >
        {/* blank until the seller picks a value */}
        <option value="" />
        {props.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {value && <ClearOne label={props.label} onClear={() => pick('')} />}
    </span>
  )
}
const pickFilter = (label: string, options: string[]) => ({
  filter: 'agTextColumnFilter',
  filterParams: { filterOptions: ['equals'], maxNumConditions: 1 },
  floatingFilter: true,
  floatingFilterComponent: PickFloatingFilter,
  floatingFilterComponentParams: { label, options },
  suppressHeaderFilterButton: true,
  suppressFloatingFilterButton: true,
})

const filtersSet = (api: GridApi) => Object.keys(api.getFilterModel() ?? {}).length

// The first cell of the filter row: one button that clears every column filter (shown when 2+ are set)
function ClearFilters(props: CustomFloatingFilterProps) {
  const [active, setActive] = useState(() => filtersSet(props.api) > 1)
  useEffect(() => {
    const update = () => setActive(filtersSet(props.api) > 1)
    props.api.addEventListener('filterChanged', update)
    return () => props.api.removeEventListener('filterChanged', update)
  }, [props.api])
  if (!active) return null
  return (
    <button type="button" className="grid-clear" aria-label="Clear all filters" data-tip="Clear all filters" onClick={() => {
        props.api.setFilterModel(null)
        window.dispatchEvent(new Event(CLEAR_ALL))
      }}
    >
      <CloseIcon />
    </button>
  )
}

type Props = {
  items: DisputeSummary[] // every row that matches the chips; the grid sorts, filters and pages them
  reasons: string[] // PayPal's fixed list, for the Reason dropdown
  search: string // the toolbar's search box, applied by AG Grid's quick filter
  page: number
  pageSize: number // 0 = all
  openId: string | null
  onOpen: (id: string) => void
  onCount: (shown: number) => void // rows left after the grid's own column filters
  onReady: (exportCsv: () => void) => void
}

export default function DisputeGrid({ items, reasons, search, page, pageSize, openId, onOpen, onCount, onReady }: Props) {
  const api = useRef<GridApi<DisputeSummary> | null>(null)
  const [visible, setVisible] = useState(items.length) // rows the column filters leave
  const [total, setTotal] = useState<Total[]>([])
  // After any change to the rows or filters: the footer's count and the totals row
  const recount = (e: { api: GridApi<DisputeSummary> }) => {
    // every row the filters and search leave, on all pages
    const rows: DisputeSummary[] = []
    for (let i = 0; i < e.api.getDisplayedRowCount(); i++) {
      const data = e.api.getDisplayedRowAtIndex(i)?.data
      if (data) rows.push(data)
    }
    setVisible(rows.length)
    onCount(rows.length)
    setTotal(rows.length > 0 ? [totalOf(rows)] : [])
  }

  const columns = useMemo<ColDef<DisputeSummary>[]>(
    () => [
      {
        colId: CLEAR_COL,
        headerName: 'Columns',
        // the top-left corner: show or hide columns, reset the layout
        headerComponent: ColumnsMenu,
        headerComponentParams: {
          fixed: [CLEAR_COL, 'id'],
          onReset: () => {
            api.current?.resetColumnState()
            try {
              localStorage.removeItem(STATE_KEY)
            } catch {
              /* nothing saved */
            }
          },
        },
        suppressHeaderKeyboardEvent: (p) => p.event.key === 'Enter' || p.event.key === ' ',
        width: 44,
        minWidth: 44,
        maxWidth: 44,
        pinned: 'left',
        lockPinned: true,
        lockPosition: 'left',
        sortable: false,
        resizable: false,
        suppressMovable: true,
        floatingFilter: true,
        floatingFilterComponent: ClearFilters,
        // a filter must exist for the floating cell to render; it never filters anything
        filter: 'agTextColumnFilter',
        suppressHeaderFilterButton: true,
        suppressFloatingFilterButton: true,
        valueGetter: () => '',
      },
      {
        headerName: 'Case',
        field: 'id',
        // the totals row's label is its value, so the cell redraws when the count changes
        valueGetter: (p) => {
          const n = (p.data as Total | undefined)?.count ?? 0
          return p.node?.rowPinned ? `Total · ${n} ${n === 1 ? 'dispute' : 'disputes'}` : p.data?.id
        },
        minWidth: 180,
        // Always the first column, pinned so it stays in view when the table scrolls sideways
        pinned: 'left',
        lockPinned: true,
        lockPosition: 'left',
        suppressMovable: true,
        ...containsFilter('Case'),
        // Only the case id opens a case (a real button: works with mouse and keyboard)
        cellRenderer: (p: ICellRendererParams<DisputeSummary>) =>
          p.node.rowPinned ? (
            <span className="grid-total">
              <span className="grid-total-label">Total</span>
              {String(p.value).split(' · ')[1]}
            </span>
          ) : (
            p.data && (
            <button
              className="link mono"
              data-open={p.data.id}
              aria-current={openId === p.data.id}
              onClick={() => onOpen(p.data!.id)}
            >
              {p.data.id}
            </button>
            )
          ),
        suppressKeyboardEvent: (p) => p.event.key === 'Enter', // let Enter press the button
      },
      { headerName: 'Reason', field: 'reason', flex: 1, minWidth: 170, ...pickFilter('Reason', reasons) },
      {
        headerName: 'Amount',
        colId: 'amount',
        valueGetter: (p) => Number(p.data?.amount?.value ?? 0),
        valueFormatter: (p) => formatMoney(p.data?.amount ?? null),
        filterValueGetter: (p) => formatMoney(p.data?.amount ?? null),
        ...containsFilter('Amount'),
        cellClass: 'center strong',
        headerClass: 'center',
        minWidth: 120,
      },
      {
        headerName: 'Status',
        colId: 'status',
        valueGetter: (p) => statusOf(p.data?.status ?? '').label,
        cellRenderer: (p: ICellRendererParams<DisputeSummary>) =>
          p.data && !p.node.rowPinned && <StatusPill status={p.data.status} />,
        enableCellChangeFlash: true,
        ...pickFilter('Status', Object.values(GROUPS).map((g) => g.label)),
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
          p.node.rowPinned ? null : p.value ? (
            <Deadline iso={p.data?.respond_by} label="" />
          ) : (
            <span className="muted">—</span>
          ),
        comparator: byTime,
        ...dateFilter('Reply by'),
        cellClass: 'center',
        headerClass: 'center',
        minWidth: 190,
      },
      {
        headerName: 'Stage',
        colId: 'stage',
        valueGetter: (p) => (p.node?.rowPinned ? '' : (p.data?.stage ?? '—')),
        ...containsFilter('Stage'),
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
        ...dateFilter('Opened'),
        minWidth: 140,
      },
      {
        headerName: 'Last update',
        colId: 'updated',
        valueGetter: (p) => time(p.data?.updated ?? null),
        valueFormatter: (p) => formatDateTime(p.data?.updated ?? null),
        tooltipValueGetter: (p) => formatAgo(p.data?.updated ?? null),
        comparator: byTime,
        ...dateFilter('Last update'),
        cellClass: 'muted',
        minWidth: 170,
      },
    ],
    [openId, onOpen, reasons],
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
        defaultColDef={{ sortable: true, resizable: true, flex: 1 }}
        getRowId={(p) => p.data.id}
        rowClassRules={{
          selected: (p) => p.data?.id === openId,
          'due-bad': (p) => !p.node.rowPinned && dueTone(p.data) === 'bad',
          'due-warn': (p) => !p.node.rowPinned && dueTone(p.data) === 'warn',
        }}
        pinnedBottomRowData={total}
        quickFilterText={search}
        initialState={savedLayout()}
        onStateUpdated={(e) => saveLayout(e.state)}
        domLayout="autoHeight"
        pagination
        paginationPageSize={pageSize || Math.max(items.length, 1)}
        suppressPaginationPanel
        suppressCellFocus={false}
        tooltipShowDelay={300}
        suppressNoRowsOverlay
        onGridReady={(e) => {
          api.current = e.api
          // Exactly what's on screen: every row the chips, search and column filters leave
          onReady(() =>
            e.api.exportDataAsCsv({
              fileName: 'disputes.csv',
              columnKeys: e.api.getAllDisplayedColumns().filter((c) => c.getColId() !== CLEAR_COL),
              skipPinnedBottom: true, // the totals row is for the screen
            }),
          )
        }}
        onFilterChanged={recount}
        onRowDataUpdated={recount}
      />
      {visible === 0 && (
        <p className="grid-empty" role="status">
          No disputes match these filters.
        </p>
      )}
    </div>
  )
}
