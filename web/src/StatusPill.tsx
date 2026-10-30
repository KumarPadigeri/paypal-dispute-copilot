import { statusOf } from './status'

export default function StatusPill({ status, tipAlign }: { status: string; tipAlign?: 'end' }) {
  const s = statusOf(status)
  return (
    <span className={`pill ${s.tone}`} data-tip={s.detail} data-tip-align={tipAlign}>
      {s.Icon && <s.Icon />}
      {s.label}
    </span>
  )
}
