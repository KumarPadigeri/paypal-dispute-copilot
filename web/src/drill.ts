// Drill-down from Insights into the inbox: a chart bar (or the link under it) opens the inbox
// with one extra filter, carried in the address: "#/?reason=Item%20not%20received" or
// "#/?due=later". The inbox shows it as a removable tag.
import type { DisputeSummary } from './api'
import { dueOf } from './due'
import { statusOf } from './status'

export const BUCKETS = [
  { key: 'overdue', label: 'Overdue', tone: 'bad' },
  { key: 'soon', label: 'Due in 2 days', tone: 'bad' },
  { key: 'week', label: 'Due this week', tone: 'warn' },
  { key: 'later', label: 'Due later', tone: 'info' },
  { key: 'waiting', label: 'Waiting on buyer or PayPal', tone: 'muted' },
] as const
export type Bucket = (typeof BUCKETS)[number]['key']

/** Which "money at stake" bar a dispute is in (resolved ones have nothing at stake). */
export function bucketOf(d: DisputeSummary): Bucket | null {
  const group = statusOf(d.status).group
  if (group === 'waiting') return 'waiting'
  if (group !== 'reply') return null
  const due = dueOf(d.respond_by)
  if (!due) return 'later'
  const days = due.msLeft / 86_400_000
  return days <= 0 ? 'overdue' : days <= 2 ? 'soon' : days <= 7 ? 'week' : 'later'
}

export type Drill = { kind: 'reason' | 'due'; value: string }

export const drillHref = (kind: Drill['kind'], value: string) => `#/?${kind}=${encodeURIComponent(value)}`

export function drillFromHash(hash = location.hash): Drill | null {
  const m = hash.match(/^#\/\?(reason|due)=(.+)$/)
  return m ? { kind: m[1] as Drill['kind'], value: decodeURIComponent(m[2]) } : null
}

export function drillMatches(drill: Drill, d: DisputeSummary): boolean {
  if (drill.kind === 'reason') return d.reason === drill.value
  return bucketOf(d) === drill.value
}

/** The tag's words: "Reason: Item not received" or "Due later". */
export function drillLabel(drill: Drill): string {
  if (drill.kind === 'reason') return `Reason: ${drill.value}`
  return BUCKETS.find((b) => b.key === drill.value)?.label ?? drill.value
}
