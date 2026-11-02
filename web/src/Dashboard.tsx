import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgChartOptions } from 'ag-charts-community'
import { AgCharts } from 'ag-charts-react'
import { type DisputeSummary, formatMoney } from './api'
import { dueOf } from './due'
import { GROUPS, type Group, statusOf } from './status'

/** Canvas charts can't read CSS variables, so read the theme's colors and redo them when it flips. */
function useThemeColors() {
  const read = () => {
    const css = getComputedStyle(document.documentElement)
    const v = (name: string) => css.getPropertyValue(name).trim()
    return {
      text: v('--text'),
      muted: v('--muted'),
      border: v('--border'),
      tone: { warn: v('--warn'), info: v('--accent'), ok: v('--ok'), muted: v('--faint') },
    }
  }
  const [colors, setColors] = useState(read)
  useEffect(() => {
    const watch = new MutationObserver(() => setColors(read()))
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => watch.disconnect()
  }, [])
  return colors
}

// The title names the chart for screen readers too (AG Charts labels its canvas with it)
const chartBase = (colors: ReturnType<typeof useThemeColors>, title: string) => ({
  title: { text: title, fontSize: 12, fontWeight: 600 as const, color: colors.muted, textAlign: 'left' as const },
  background: { visible: false },
  padding: { top: 4, right: 8, bottom: 4, left: 8 },
  legend: { enabled: false },
  keyboard: { enabled: false }, // charts are hidden from screen readers; the chips filter by keyboard
  // keep the canvas quiet for screen readers: the same numbers are in the tiles and in the label
  tooltip: { enabled: true },
  theme: {
    params: { fontFamily: 'inherit', fontSize: 12, foregroundColor: colors.text, textColor: colors.muted },
  },
})

type Props = {
  disputes: DisputeSummary[]
  filter: 'all' | Group
  onFilter: (g: 'all' | Group) => void
}

/** At a glance: what needs you, by when, how much is at stake. Clicking a status slice filters the list. */
export default function Dashboard({ disputes, filter, onFilter }: Props) {
  const colors = useThemeColors()

  // The charts are hidden from screen readers, so nothing inside them may take keyboard focus either
  const charts = useRef<HTMLElement>(null)
  useEffect(() => {
    const root = charts.current
    if (!root) return
    const unfocus = () => root.querySelectorAll<HTMLElement>('[tabindex]:not([tabindex="-1"])').forEach((e) => (e.tabIndex = -1))
    unfocus()
    const watch = new MutationObserver(unfocus)
    watch.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['tabindex'] })
    return () => watch.disconnect()
  }, [])

  const needReply = disputes.filter((d) => statusOf(d.status).group === 'reply')
  const soonest = needReply
    .map((d) => d.respond_by)
    .filter((d): d is string => !!d)
    .sort()[0]
  const due = dueOf(soonest)
  // Money only adds up within one currency; otherwise the tile says how many are open
  const open = disputes.filter((d) => statusOf(d.status).group !== 'resolved' && d.amount)
  const currencies = new Set(open.map((d) => d.amount!.currency_code))
  const atStake =
    currencies.size === 1
      ? formatMoney({
          currency_code: [...currencies][0],
          value: String(open.reduce((sum, d) => sum + Number(d.amount!.value), 0)),
        })
      : `${open.length} open`

  const byStatus = (Object.keys(GROUPS) as Group[]).map((g) => ({
    group: g,
    label: GROUPS[g].label,
    count: disputes.filter((d) => statusOf(d.status).group === g).length,
  }))
  const byReason = [...new Set(disputes.map((d) => d.reason))]
    .map((r) => ({ reason: r, count: disputes.filter((d) => d.reason === r).length }))
    .sort((a, b) => b.count - a.count)

  const donut = useMemo<AgChartOptions>(
    () => ({
      ...chartBase(colors, 'By status'),
      data: byStatus.filter((s) => s.count > 0),
      series: [
        {
          type: 'donut',
          angleKey: 'count',
          calloutLabelKey: 'label',
          calloutLabel: { enabled: false },
          innerRadiusRatio: 0.62,
          fills: byStatus.filter((s) => s.count > 0).map((s) => colors.tone[GROUPS[s.group].tone]),
          strokeWidth: 0,
          highlightStyle: { item: { fillOpacity: 0.8 } },
          listeners: {
            nodeClick: (e: { datum: { group: Group } }) => onFilter(filter === e.datum.group ? 'all' : e.datum.group),
          },
        },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colors, disputes, filter],
  )

  const bars = useMemo<AgChartOptions>(
    () => ({
      ...chartBase(colors, 'By reason'),
      data: byReason,
      series: [
        {
          type: 'bar',
          direction: 'horizontal',
          xKey: 'reason',
          yKey: 'count',
          yName: 'Disputes',
          fill: colors.tone.info,
          cornerRadius: 3,
        },
      ],
      axes: [
        { type: 'category', position: 'left', line: { enabled: false }, label: { color: colors.muted } },
        {
          type: 'number',
          position: 'bottom',
          interval: { step: 1 },
          gridLine: { style: [{ stroke: colors.border, lineDash: [3, 3] }] },
          label: { color: colors.muted },
        },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colors, disputes],
  )

  const statusText = byStatus.map((s) => `${s.count} ${s.label.toLowerCase()}`).join(', ')
  const reasonText = byReason.map((r) => `${r.count} ${r.reason.toLowerCase()}`).join(', ')

  return (
    <section className="dashboard" aria-label="Summary" ref={charts}>
      <div className="tile">
        <span className="tile-label">Needs reply</span>
        <span className="tile-value">{needReply.length}</span>
      </div>
      <div className="tile">
        <span className="tile-label">Next deadline</span>
        <span className={`tile-value small ${due ? due.tone : ''}`}>{due ? due.text : 'None'}</span>
      </div>
      <div className="tile">
        <span className="tile-label">At stake</span>
        <span className="tile-value">{atStake}</span>
      </div>
      {/* Each chart is one labelled image for screen readers; its canvas is mouse-only extra,
          since the status chips and reason filter do the same filtering by keyboard. */}
      <figure className="chart" role="img" aria-label={`By status: ${statusText}`}>
        <div aria-hidden="true">
          <AgCharts options={donut} />
        </div>
      </figure>
      <figure className="chart wide" role="img" aria-label={`By reason: ${reasonText}`}>
        <div aria-hidden="true">
          <AgCharts options={bars} />
        </div>
      </figure>
    </section>
  )
}
