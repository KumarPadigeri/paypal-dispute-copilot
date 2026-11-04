import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgChartOptions } from 'ag-charts-community'
import { AgCharts } from 'ag-charts-react'
import Dashboard from './Dashboard'
import { InsightsSkeleton } from './Skeleton'
import { type DisputeSummary, formatMoney, listDisputes } from './api'
import { BUCKETS, bucketOf, drillHref } from './drill'

/** Canvas charts can't read CSS variables, so read the theme's colors and redo them when it flips. */
function useThemeColors() {
  const read = () => {
    const css = getComputedStyle(document.documentElement)
    const v = (name: string) => css.getPropertyValue(name).trim()
    return {
      text: v('--text'),
      muted: v('--muted'),
      border: v('--border'),
      // fills made for charts (see index.css), not the text tones, so bars look alike in both modes
      tone: { bad: v('--chart-bad'), warn: v('--chart-warn'), info: v('--chart-info'), muted: v('--chart-muted') },
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
type Colors = ReturnType<typeof useThemeColors>

const base = (c: Colors) => ({
  background: { visible: false },
  padding: { top: 8, right: 12, bottom: 8, left: 8 },
  keyboard: { enabled: false }, // each chart is one labelled image; its numbers are in the label
  theme: { params: { fontFamily: 'inherit', fontSize: 12, foregroundColor: c.text, textColor: c.muted } },
})

const axes = (c: Colors, numberLabel?: (v: number) => string) => [
  { type: 'category' as const, position: 'left' as const, line: { enabled: false }, label: { color: c.muted } },
  {
    type: 'number' as const,
    position: 'bottom' as const,
    interval: numberLabel ? undefined : { step: 1 },
    gridLine: { style: [{ stroke: c.border, lineDash: [3, 3] }] },
    label: { color: c.muted, ...(numberLabel ? { formatter: (p: { value: number }) => numberLabel(p.value) } : {}) },
  },
]

/** A chart in a card: one image for screen readers, labelled with the same numbers it draws. */
type Link = { label: string; value: string; href: string; color?: string }

function ChartCard({ title, summary, options, links }: { title: string; summary: string; options: AgChartOptions; links: Link[] }) {
  const box = useRef<HTMLDivElement>(null)
  // nothing inside the hidden canvas may take keyboard focus
  useEffect(() => {
    const root = box.current
    if (!root) return
    const unfocus = () =>
      root.querySelectorAll<HTMLElement>('[tabindex]:not([tabindex="-1"])').forEach((e) => (e.tabIndex = -1))
    unfocus()
    const watch = new MutationObserver(unfocus)
    watch.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['tabindex'] })
    return () => watch.disconnect()
  }, [])
  return (
    <div className="insight">
      <h3 className="tile-label">{title}</h3>
      {/* the chart is one image for screen readers, named with the same numbers it draws */}
      <div className="insight-chart" role="img" aria-label={`${title}: ${summary}`}>
        <div ref={box} aria-hidden="true">
          <AgCharts options={options} />
        </div>
      </div>
      {/* Clicking a bar opens those disputes; these links do the same by keyboard */}
      {links.length > 0 && (
        <ul className="insight-links" aria-label={`Open disputes: ${title.toLowerCase()}`}>
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href}>
                {l.color && <span className="dot" style={{ background: l.color }} aria-hidden="true" />}
                <span className="insight-link-label">{l.label}</span>
                <strong>{l.value}</strong>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Insights: the dispute inbox as charts (AG Charts), on a screen of its own. */
export default function Insights() {
  const [disputes, setDisputes] = useState<DisputeSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const colors = useThemeColors()
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    listDisputes().then(setDisputes, (e: Error) => setError(e.message))
    heading.current?.focus({ preventScroll: true })
  }, [])

  const charts = useMemo(() => {
    if (!disputes) return null
    // Money adds up only within one currency
    const currencies = new Set(disputes.flatMap((d) => (d.amount ? [d.amount.currency_code] : [])))
    const currency = currencies.size === 1 ? [...currencies][0] : null
    const money = (v: number) => (currency ? formatMoney({ currency_code: currency, value: String(v) }) : `${v}`)
    const amount = (d: DisputeSummary) => Number(d.amount?.value ?? 0)
    const toneFill = (t: string) => colors.tone[t as keyof Colors['tone']] ?? colors.tone.info

    // 1. What could I lose, and by when? Open disputes' money, by how soon I must reply.
    const buckets = BUCKETS.map((b) => ({ ...b, amount: 0, count: 0 }))
    for (const d of disputes) {
      const b = buckets.find((x) => x.key === bucketOf(d))
      if (b) {
        b.amount += amount(d)
        b.count += 1
      }
    }
    const atStake = buckets.filter((b) => b.count > 0)

    // 2. Why do my disputes happen? Money per reason (every dispute), largest first.
    const byReason = [...new Set(disputes.map((d) => d.reason))]
      .map((r) => {
        const of = disputes.filter((d) => d.reason === r)
        return { reason: r, amount: of.reduce((s, d) => s + amount(d), 0), count: of.length }
      })
      .sort((a, b) => b.amount - a.amount)

    const go = (href: string) => () => (location.hash = href.slice(1))

    const cases = (n: number) => (n === 1 ? '1 case' : `${n} cases`)
    const moneyTip = (label: string) => ({
      renderer: (p: { datum: { amount: number; count: number } }) => ({
        heading: label,
        data: [
          { label: 'Amount', value: money(p.datum.amount) },
          { label: 'Cases', value: String(p.datum.count) },
        ],
      }),
    })

    return [
      {
        title: currency ? 'Money at stake, by reply deadline' : 'At stake, by reply deadline (mixed currencies)',
        summary: atStake.length
          ? atStake.map((b) => `${money(b.amount)} ${b.label.toLowerCase()} (${cases(b.count)})`).join(', ')
          : 'nothing open',
        options: {
          ...base(colors),
          data: atStake,
          legend: { enabled: false },
          series: [
            {
              type: 'bar',
              direction: 'horizontal',
              xKey: 'label',
              yKey: 'amount',
              yName: 'Amount',
              cornerRadius: 4,
              itemStyler: (p: { datum: { tone: string } }) => ({ fill: toneFill(p.datum.tone) }),
              cursor: 'pointer',
              listeners: { nodeClick: (e: { datum: { key: string } }) => go(drillHref('due', e.datum.key))() },
              label: { formatter: (p: { datum: { amount: number; count: number } }) => `${money(p.datum.amount)} · ${cases(p.datum.count)}`, placement: 'outside-end', color: colors.text },
              tooltip: moneyTip('At stake'),
            },
          ],
          axes: axes(colors, money),
        } as AgChartOptions,
        links: atStake.map((b) => ({ label: b.label, value: `${money(b.amount)} · ${cases(b.count)}`, href: drillHref('due', b.key), color: toneFill(b.tone) })),
      },
      {
        title: currency ? 'Money by dispute reason' : 'By dispute reason (mixed currencies)',
        summary: byReason.map((r) => `${money(r.amount)} ${r.reason.toLowerCase()} (${cases(r.count)})`).join(', '),
        options: {
          ...base(colors),
          data: byReason,
          legend: { enabled: false },
          series: [
            {
              type: 'bar',
              direction: 'horizontal',
              xKey: 'reason',
              yKey: 'amount',
              yName: 'Amount',
              fill: colors.tone.info,
              cornerRadius: 4,
              cursor: 'pointer',
              listeners: { nodeClick: (e: { datum: { reason: string } }) => go(drillHref('reason', e.datum.reason))() },
              label: { formatter: (p: { datum: { amount: number; count: number } }) => `${money(p.datum.amount)} · ${cases(p.datum.count)}`, placement: 'outside-end', color: colors.text },
              tooltip: moneyTip('Reason'),
            },
          ],
          axes: axes(colors, money),
        } as AgChartOptions,
        links: byReason.map((r) => ({ label: r.reason, value: `${money(r.amount)} · ${cases(r.count)}`, href: drillHref('reason', r.reason) })),
      },
    ]
  }, [disputes, colors])

  return (
    <section className="insights" aria-labelledby="insights-title">
      <div className="insights-head">
        <h2 id="insights-title" ref={heading} tabIndex={-1}>
          Insights
        </h2>
      </div>
      {error && <div className="notice error">Could not load disputes from PayPal ({error}).</div>}
      {disputes && <Dashboard disputes={disputes} />}
      {!disputes && !error && <InsightsSkeleton />}
      {charts && (
        <div className="insight-grid">
          {charts.map((c) => (
            <ChartCard key={c.title} {...c} />
          ))}
        </div>
      )}
    </section>
  )
}
