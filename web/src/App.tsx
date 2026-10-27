import { useEffect, useState } from 'react'
import { type DisputeSummary, formatDate, formatMoney, listDisputes, statusOf } from './api'

const needsReply = (d: DisputeSummary) => Number(d.status === 'WAITING_FOR_SELLER_RESPONSE')

function DisputeList({ onOpen }: { onOpen: (id: string) => void }) {
  const [disputes, setDisputes] = useState<DisputeSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listDisputes().then(
      // Cases that need the seller's reply come first.
      (list) => setDisputes([...list].sort((a, b) => needsReply(b) - needsReply(a))),
      (e: Error) => setError(e.message),
    )
  }, [])

  if (error) return <div className="notice error">Could not load disputes from PayPal ({error}).</div>
  if (!disputes) return <div className="notice">Loading disputes from PayPal…</div>
  if (disputes.length === 0) return <div className="notice">No open disputes. Nice.</div>

  return (
    <div className="list">
      {disputes.map((d) => {
        const status = statusOf(d.status)
        return (
          <button key={d.id} className="row" onClick={() => onOpen(d.id)}>
            <span className="reason">{d.reason}</span>
            <span className="amount">{formatMoney(d.amount)}</span>
            <span className="meta">
              Opened {formatDate(d.created)}
              <span className="sep"> · </span>
              <span className="mono">{d.id}</span>
            </span>
            <span className={`pill ${status.tone}`}>{status.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export default function App() {
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <div className="app">
      <header className="topbar">
        <img src="/favicon.svg" alt="" />
        <h1>Dispute Copilot</h1>
        <span className="tag">PayPal sandbox</span>
      </header>
      <h2 className="section-title">Disputes</h2>
      <DisputeList onOpen={setOpenId} />
      {openId && <p className="meta">Selected {openId} (case view comes next)</p>}
    </div>
  )
}
