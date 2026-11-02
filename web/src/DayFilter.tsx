import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/style.css'
import { CalendarIcon } from './icons'

const short = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
// Day buttons are named starting with the number they show ("1 November 2026, Sunday"), so voice
// control users can say what they see
const dayName = (d: Date, m: { selected?: boolean; today?: boolean }) =>
  `${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}, ` +
  d.toLocaleDateString('en-US', { weekday: 'long' }) +
  (m.today ? ', today' : '') +
  (m.selected ? ', selected' : '')

/**
 * A grid filter cell for a date column: a calendar button showing the picked day ("Oct 28").
 * The calendar (react-day-picker, drawn in our colors) opens in a popup above the grid, so the
 * narrow filter cell never clips it. Esc or a click outside closes it; focus returns to the button.
 */
export default function DayFilter({ label, day, onPick }: { label: string; day: Date | null; onPick: (d: Date | null) => void }) {
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState<{ top: number; left: number } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !button.current) return
    const r = button.current.getBoundingClientRect()
    // below the button, kept on screen at the right edge
    setAt({ top: r.bottom + 6, left: Math.min(r.left, window.innerWidth - 300) })
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = () => {
      setOpen(false)
      button.current?.focus()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation() // don't also close the open case
        close()
      }
    }
    const onDown = (e: MouseEvent) => {
      if (!popup.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`day-filter ${day ? 'set' : ''}`}
        aria-label={`${label} filter${day ? `: ${short(day)}` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <CalendarIcon />
        {day && <span>{short(day)}</span>}
      </button>
      {open &&
        at &&
        createPortal(
          <div ref={popup} className="day-popup" role="dialog" aria-label={`Pick a ${label.toLowerCase()} day`} style={at}>
            <DayPicker
              mode="single"
              autoFocus
              selected={day ?? undefined}
              defaultMonth={day ?? new Date()}
              labels={{ labelDayButton: dayName }}
              onSelect={(d) => {
                onPick(d ?? null)
                setOpen(false)
                button.current?.focus()
              }}
            />
          </div>,
          document.body,
        )}
    </>
  )
}
