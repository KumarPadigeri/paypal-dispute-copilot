import { type DisputeSummary, formatMoney } from './api'
import { dueOf } from './due'
import { statusOf } from './status'

/** Money adds up only within one currency; otherwise say how many are open. */
function amountAtStake(disputes: DisputeSummary[]) {
  const open = disputes.filter((d) => statusOf(d.status).group !== 'resolved' && d.amount)
  const currencies = new Set(open.map((d) => d.amount!.currency_code))
  if (currencies.size !== 1) return `${open.length} open`
  return formatMoney({
    currency_code: [...currencies][0],
    value: String(open.reduce((sum, d) => sum + Number(d.amount!.value), 0)),
  })
}

/** At a glance, above the list and on Insights: what needs you, by when, how much is at stake. */
export default function Dashboard({ disputes }: { disputes: DisputeSummary[] }) {
  const needReply = disputes.filter((d) => statusOf(d.status).group === 'reply')
  const soonest = needReply
    .map((d) => d.respond_by)
    .filter((d): d is string => !!d)
    .sort()[0]
  const due = dueOf(soonest)

  return (
    <section className="dashboard" aria-label="Summary">
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
        <span className="tile-value">{amountAtStake(disputes)}</span>
      </div>
    </section>
  )
}
