import type { DraftEvent } from './api'

// The draft's whole path, so the seller sees what is running and what comes next. Evidence is
// gathered from PayPal before any AI runs; the rewrite only happens when the Verifier rejects.
export const STEPS = ['Evidence', 'Writer', 'Verifier', 'Rewrite', 'Ready'] as const
export const REWRITE = 3

export type Progress = { now: number; skipRewrite: boolean; failed: boolean }
export const START: Progress = { now: 1, skipRewrite: false, failed: false }

/** Moves the stepper on with each event of the draft stream. */
export function advance(p: Progress, e: DraftEvent): Progress {
  switch (e.name) {
    case 'writing':
      return { ...p, now: 1 }
    case 'verifying':
      return { ...p, now: e.data.round === 1 ? 2 : REWRITE }
    case 'verdicts':
      if (e.data.round > 1) return { ...p, now: REWRITE }
      return e.data.verdicts.every((v) => v.supported) ? { ...p, now: 4, skipRewrite: true } : { ...p, now: REWRITE }
    case 'rewriting':
      return { ...p, now: REWRITE }
    case 'final':
      return { ...p, now: STEPS.length }
    case 'error':
      return { ...p, failed: true }
    default:
      return p
  }
}
