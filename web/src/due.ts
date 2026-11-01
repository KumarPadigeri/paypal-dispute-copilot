// PayPal's reply-by date in words a seller acts on. Missing it means PayPal decides the case
// for the buyer, so the countdown gets louder as the date gets close. Shown in the viewer's own
// time zone (the real last moment they can reply).

const DAY = 24 * 60 * 60 * 1000

export type Due = { text: string; tone: 'bad' | 'warn' | 'muted'; msLeft: number }

export function dueOf(iso: string | null | undefined, now = Date.now()): Due | null {
  if (!iso) return null
  const due = new Date(iso)
  const msLeft = due.getTime() - now
  const date = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (msLeft <= 0) return { text: `Overdue (was ${date})`, tone: 'bad', msLeft }
  if (msLeft < DAY) return { text: `${date} · less than a day left`, tone: 'bad', msLeft }
  const days = Math.floor(msLeft / DAY)
  const left = days === 1 ? '1 day left' : `${days} days left`
  return { text: `${date} · ${left}`, tone: days <= 2 ? 'bad' : days <= 5 ? 'warn' : 'muted', msLeft }
}
