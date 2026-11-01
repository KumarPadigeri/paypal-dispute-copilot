import { statusOf } from './status'

export default function StatusPill({ status }: { status: string }) {
  const s = statusOf(status)
  return (
    <span className={`pill ${s.tone}`}>
      {s.Icon && <s.Icon />}
      {s.label}
    </span>
  )
}
