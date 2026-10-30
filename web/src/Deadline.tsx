import { dueOf } from './due'
import { AlertIcon, ClockIcon } from './icons'

/** "Reply by Nov 16 · 17 days left": amber at 5 days or fewer, red at 2 or fewer (words too). */
export default function Deadline({ iso, label = 'Reply by' }: { iso: string | null | undefined; label?: string }) {
  const due = dueOf(iso)
  if (!due) return null
  return (
    <span className={`due ${due.tone}`}>
      {due.tone === 'bad' ? <AlertIcon /> : <ClockIcon />}
      {label && <span className="due-label">{label}</span>}
      {due.text}
    </span>
  )
}
