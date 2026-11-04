import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/style.css'
import { CalendarIcon } from './icons'
import { usePopup } from './popup'

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
 * narrow filter cell never clips it (see popup.ts).
 */
export default function DayFilter({ label, day, onPick }: { label: string; day: Date | null; onPick: (d: Date | null) => void }) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const at = usePopup(open, setOpen, button, popup)

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
