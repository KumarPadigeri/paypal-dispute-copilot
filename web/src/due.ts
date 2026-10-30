// PayPal's reply-by date in words a seller acts on. Missing it means PayPal decides the case
// for the buyer, so the countdown gets louder as the date gets close. Shown in the viewer's own
// time zone (the real last moment they can reply); `exact` also gives PayPal's UTC time.

const DAY = 24 * 60 * 60 * 1000

export type Due = { text: string; exact: string; tone: 'bad' | 'warn' | 'muted'; msLeft: number }

export function dueOf(iso: string | null | undefined, now = Date.now()): Due | null {
  if (!iso) return null
  const due = new Date(iso)
  const msLeft = due.getTime() - now
  const date = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const local = due.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
  const utc = due.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
  })
  const exact = `Reply before ${local} (${utc} UTC)`
  if (msLeft <= 0) return { text: `Overdue (was ${date})`, exact, tone: 'bad', msLeft }
  if (msLeft < DAY) return { text: `${date} · less than a day left`, exact, tone: 'bad', msLeft }
  const days = Math.floor(msLeft / DAY)
  const left = days === 1 ? '1 day left' : `${days} days left`
  return { text: `${date} · ${left}`, exact, tone: days <= 2 ? 'bad' : days <= 5 ? 'warn' : 'muted', msLeft }
}
