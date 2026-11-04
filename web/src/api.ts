// Types and calls for the FastAPI backend (copilot/api.py).

export type Money = { currency_code: string; value: string }

export type DisputeSummary = {
  id: string
  status: string
  reason: string
  amount: Money | null
  created: string | null
  updated: string | null
  stage: string | null // Inquiry, Chargeback, ...
  respond_by: string | null // PayPal's reply-by date (only while it waits for the seller)
}

async function getJson<T>(path: string): Promise<T> {
  const resp = await fetch(path)
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`)
  return resp.json() as Promise<T>
}

export const listDisputes = () => getJson<DisputeSummary[]>('/api/disputes')

/** Window event after an action changed a case, so the inbox fetches PayPal's new status. */
export const DISPUTES_CHANGED = 'disputes:changed'

/** PayPal's dispute reasons, in plain words and PayPal's order. */
export const listReasons = () => getJson<string[]>('/api/reasons')

export const formatMoney = (m: Money | null) =>
  m ? new Intl.NumberFormat('en-US', { style: 'currency', currency: m.currency_code }).format(Number(m.value)) : ''

/** "5 min ago", "3 h ago", "2 days ago"; falls back to the date after a week. */
export function formatAgo(iso: string | null): string {
  if (!iso) return ''
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`
  if (minutes < 60 * 24 * 7) return `${Math.round(minutes / 1440)} days ago`
  return formatDate(iso)
}

/** "Oct 28, 3:04 PM" (the year is added when it is not this year), in the viewer's time zone. */
export function formatDateTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
  })
}

export const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

export type Evidence = { id: string; text: string; source: string }
export type Claim = { id: string; text: string }

export type CaseDetail = {
  dispute_id: string
  reason: string
  amount: string // e.g. "49.99 USD"
  status: string
  respond_by: string | null // "Nov 16, 2026 (UTC)"
  respond_by_iso: string | null // the same date, machine-readable
  stage: string | null // PayPal's lifecycle stage: INQUIRY, CHARGEBACK, PRE_ARBITRATION, ARBITRATION
  channel: string | null // INTERNAL (opened with PayPal) or EXTERNAL (card issuer)
  opened_iso: string | null
  updated_iso: string | null
  requested_from_seller: string[]
  evidence: Evidence[]
  claims: Claim[]
  actions: string[]
  shipments: { carrier: string; tracking_number: string; status: string | null }[]
  // The case's history from PayPal's records, oldest first: buyer, seller ("you") and PayPal
  conversation: { who: 'buyer' | 'you' | 'paypal'; time: string | null; title: string; text: string | null; opening?: boolean }[]
  // What PayPal asks for against what its records hold (plain code); null when the advice covers it
  check: { tone: 'ok' | 'warn'; text: string } | null
  advice: {
    title: string
    text: string
    blocks_draft: boolean
    resolutions: Resolution[] // only what PayPal allows right now
  } | null
}

export type Resolution = { key: string; label: string; note: string; needs: string }

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
  | { name: 'mode'; data: { live: boolean; why: 'locked' | 'limit' | null; live_left: number } }
  | { name: 'writing' | 'verifying'; data: { round: number } }
  | { name: 'draft'; data: { round: number; sentences: Sentence[] } }
  | { name: 'verdicts'; data: { round: number; verdicts: Verdict[] } }
  | { name: 'rewriting'; data: { round: number; rejected: number } }
  | { name: 'final'; data: FinalDraft }
  | { name: 'error'; data: { message: string } }

const DRAFT_EVENTS = ['mode', 'writing', 'draft', 'verifying', 'verdicts', 'rewriting', 'final', 'error'] as const

/** A reply to PayPal's reviewer, or a message to the buyer: the same Writer → Verifier loop. */
export type DraftKind = 'reply' | 'message'

/** Opens the stream; returns a function that stops it. */
export function streamDraft(id: string, onEvent: (e: DraftEvent) => void, kind: DraftKind = 'reply'): () => void {
  const pin = demoPin()
  const query = pin ? `?pin=${encodeURIComponent(pin)}` : ''
  const route = kind === 'reply' ? 'draft' : 'message-draft'
  const source = new EventSource(`/api/disputes/${encodeURIComponent(id)}/${route}${query}`)
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

/** Sends the last verified reply (to PayPal) or message (to the buyer); the server holds the text. */
export async function sendReply(id: string, kind: DraftKind = 'reply'): Promise<{ sent: boolean; status: string }> {
  const pin = demoPin()
  const resp = await fetch(`/api/disputes/${encodeURIComponent(id)}/${kind === 'reply' ? 'send' : 'message'}`, {
    method: 'POST',
    headers: pin ? { 'X-Demo-Pin': pin } : {},
  })
  const body = await resp.json()
  if (!resp.ok) throw new Error(body.detail ?? `${resp.status} ${resp.statusText}`)
  return body
}

// Public demo: live AI and sending need a PIN (kept for this browser tab only).
export type DemoInfo = { pin_required: boolean; live_left: number }
export const getDemo = () => getJson<DemoInfo>('/api/demo')

let pinInMemory: string | null = null // fallback when the browser blocks storage

export function demoPin(): string | null {
  try {
    return sessionStorage.getItem('demoPin') ?? pinInMemory
  } catch {
    return pinInMemory
  }
}

export async function unlockDemo(pin: string): Promise<boolean> {
  const resp = await fetch('/api/demo/unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  })
  const ok = resp.ok && (await resp.json()).ok === true
  if (ok) {
    pinInMemory = pin
    try {
      sessionStorage.setItem('demoPin', pin)
    } catch {
      /* storage blocked: the in-memory copy lasts until the page reloads */
    }
  }
  return ok
}

export async function resolveCase(id: string, action: string): Promise<{ done: string; status: string }> {
  const pin = demoPin()
  const resp = await fetch(`/api/disputes/${encodeURIComponent(id)}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(pin ? { 'X-Demo-Pin': pin } : {}) },
    body: JSON.stringify({ action }),
  })
  const body = await resp.json()
  if (!resp.ok) throw new Error(body.detail ?? `${resp.status} ${resp.statusText}`)
  return body
}
