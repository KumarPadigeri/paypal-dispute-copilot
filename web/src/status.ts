import type { JSX } from 'react'
import { CheckIcon, ClockIcon, ReplyIcon } from './icons'

// One source of truth for how PayPal's dispute statuses look everywhere:
// the filter chips, the pills in the list and grid, and the case panel.

export type Group = 'reply' | 'waiting' | 'resolved'
type Tone = 'warn' | 'info' | 'ok' | 'muted'

export const GROUPS: Record<Group, { label: string; tone: Tone; Icon: () => JSX.Element }> = {
  reply: { label: 'Needs reply', tone: 'warn', Icon: ReplyIcon },
  waiting: { label: 'Waiting', tone: 'info', Icon: ClockIcon },
  resolved: { label: 'Resolved', tone: 'ok', Icon: CheckIcon },
}

// PayPal status -> group, plus the detail a seller needs (shown as a tooltip and in the case panel).
const BY_STATUS: Record<string, { group: Group; detail: string }> = {
  WAITING_FOR_SELLER_RESPONSE: { group: 'reply', detail: 'PayPal is waiting for your reply' },
  WAITING_FOR_BUYER_RESPONSE: { group: 'waiting', detail: 'Waiting for the buyer' },
  UNDER_REVIEW: { group: 'waiting', detail: 'PayPal is reviewing the case' },
  OPEN: { group: 'waiting', detail: 'Just opened: PayPal is preparing the case' },
  RESOLVED: { group: 'resolved', detail: 'The case is closed' },
}

export function statusOf(status: string) {
  const known = BY_STATUS[status]
  if (!known) return { group: null, label: status, tone: 'muted' as Tone, Icon: null, detail: status }
  return { group: known.group, ...GROUPS[known.group], detail: known.detail }
}
