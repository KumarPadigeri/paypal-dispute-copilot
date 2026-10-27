// Types and calls for the FastAPI backend (copilot/api.py).

export type Money = { currency_code: string; value: string }

export type DisputeSummary = {
  id: string
  status: string
  reason: string
  amount: Money | null
  created: string | null
}

async function getJson<T>(path: string): Promise<T> {
  const resp = await fetch(path)
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`)
  return resp.json() as Promise<T>
}

export const listDisputes = () => getJson<DisputeSummary[]>('/api/disputes')

// PayPal's status codes in words a seller understands, plus a calm color.
export const STATUS: Record<string, { label: string; tone: 'warn' | 'info' | 'ok' | 'muted' }> = {
  WAITING_FOR_SELLER_RESPONSE: { label: 'Needs your reply', tone: 'warn' },
  UNDER_REVIEW: { label: 'PayPal reviewing', tone: 'info' },
  WAITING_FOR_BUYER_RESPONSE: { label: 'Waiting for buyer', tone: 'muted' },
  RESOLVED: { label: 'Resolved', tone: 'ok' },
}

export const statusOf = (s: string) => STATUS[s] ?? { label: s, tone: 'muted' as const }

export const formatMoney = (m: Money | null) =>
  m ? new Intl.NumberFormat('en-US', { style: 'currency', currency: m.currency_code }).format(Number(m.value)) : ''

export const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
