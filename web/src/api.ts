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

export type Evidence = { id: string; text: string; source: string }
export type Claim = { id: string; text: string }

export type CaseDetail = {
  dispute_id: string
  reason: string
  amount: string // e.g. "49.99 USD"
  status: string
  respond_by: string | null
  requested_from_seller: string[]
  evidence: Evidence[]
  claims: Claim[]
  actions: string[]
  shipments: { carrier: string; tracking_number: string }[]
}

export const getCase = (id: string) => getJson<CaseDetail>(`/api/disputes/${encodeURIComponent(id)}`)

// What PayPal asks the seller for, in plain words.
export const REQUESTED: Record<string, string> = {
  PROOF_OF_FULFILLMENT: 'Proof of shipping',
  PROOF_OF_REFUND: 'Proof of refund',
  PROOF_OF_DELIVERY_SIGNATURE: 'Delivery signature',
  ITEM_DESCRIPTION: 'Item description',
}

export const formatAmount = (amount: string) => {
  const [value, currency] = amount.split(' ')
  return formatMoney({ value, currency_code: currency })
}

// Live draft (server-sent events from /api/disputes/{id}/draft)
export type Sentence = { text: string; cites: string[]; answers: string[] }
export type Verdict = { sentence: string; supported: boolean; reason: string | null }
export type FinalDraft = {
  sentences: Sentence[]
  removed: { sentence: string; reason: string }[]
  rounds: number
  answered: string[]
  reply: string
}

export type DraftEvent =
  | { name: 'writing' | 'verifying'; data: { round: number } }
  | { name: 'draft'; data: { round: number; sentences: Sentence[] } }
  | { name: 'verdicts'; data: { round: number; verdicts: Verdict[] } }
  | { name: 'rewriting'; data: { round: number; rejected: number } }
  | { name: 'final'; data: FinalDraft }
  | { name: 'error'; data: { message: string } }

const DRAFT_EVENTS = ['writing', 'draft', 'verifying', 'verdicts', 'rewriting', 'final', 'error'] as const

/** Opens the stream; returns a function that stops it. */
export function streamDraft(id: string, onEvent: (e: DraftEvent) => void): () => void {
  const source = new EventSource(`/api/disputes/${encodeURIComponent(id)}/draft`)
  for (const name of DRAFT_EVENTS) {
    source.addEventListener(name, (msg) => {
      onEvent({ name, data: JSON.parse((msg as MessageEvent).data) } as DraftEvent)
      if (name === 'final' || name === 'error') source.close()
    })
  }
  // A dropped connection would otherwise make the browser retry and re-run the agents.
  source.onerror = () => {
    if (source.readyState !== EventSource.CLOSED) {
      source.close()
      onEvent({ name: 'error', data: { message: 'Connection to the server was lost.' } })
    }
  }
  return () => source.close()
}

export async function sendReply(id: string): Promise<{ sent: boolean; status: string }> {
  const resp = await fetch(`/api/disputes/${encodeURIComponent(id)}/send`, { method: 'POST' })
  const body = await resp.json()
  if (!resp.ok) throw new Error(body.detail ?? `${resp.status} ${resp.statusText}`)
  return body
}
