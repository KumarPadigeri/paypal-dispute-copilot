import { type DisputeSummary, formatDate, formatDateTime, formatMoney } from './api'
import { statusOf } from './status'

// Card view's export: the same columns and readable values as the grid's AG Grid CSV export.
const COLUMNS: [string, (d: DisputeSummary) => string][] = [
  ['Case', (d) => d.id],
  ['Reason', (d) => d.reason],
  ['Amount', (d) => formatMoney(d.amount)],
  ['Status', (d) => statusOf(d.status).label],
  ['Reply by', (d) => (statusOf(d.status).group === 'reply' && d.respond_by ? formatDate(d.respond_by) : '—')],
  ['Stage', (d) => d.stage ?? '—'],
  ['Opened', (d) => formatDate(d.created)],
  ['Last update', (d) => formatDateTime(d.updated)],
]

const cell = (v: string) => `"${v.replace(/"/g, '""')}"`

export function downloadCsv(rows: DisputeSummary[], fileName = 'disputes.csv') {
  const lines = [COLUMNS.map(([h]) => cell(h)), ...rows.map((d) => COLUMNS.map(([, get]) => cell(get(d))))]
  // A byte-order mark so Excel opens it as UTF-8 (the "—" and "·" stay readable)
  const blob = new Blob(['﻿' + lines.map((l) => l.join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName })
  a.click()
  URL.revokeObjectURL(url)
}
