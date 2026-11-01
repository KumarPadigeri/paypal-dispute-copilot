import { useRef } from 'react'

export const LIST_MIN = 300
const CASE_MIN = 520 // the case panel always keeps room for its two columns
export const LIST_DEFAULT = 432
const STEP = 24 // arrow-key step

type Props = {
  width: number
  onChange: (width: number) => void
  container: React.RefObject<HTMLElement | null>
}

/** The divider between the dispute list and the case panel: drag, arrow keys, double-click to reset. */
export default function Splitter({ width, onChange, container }: Props) {
  const dragging = useRef(false)

  const clamp = (w: number) => {
    const total = container.current?.clientWidth ?? 1400
    return Math.round(Math.max(LIST_MIN, Math.min(w, total - CASE_MIN)))
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    document.body.classList.add('resizing')
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || !container.current) return
    onChange(clamp(e.clientX - container.current.getBoundingClientRect().left))
  }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
    document.body.classList.remove('resizing')
  }
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = { ArrowLeft: -STEP, ArrowRight: STEP }
    if (e.key in moves) {
      e.preventDefault()
      onChange(clamp(width + moves[e.key]))
    } else if (e.key === 'Home') {
      e.preventDefault()
      onChange(clamp(LIST_MIN))
    } else if (e.key === 'End') {
      e.preventDefault()
      onChange(clamp(Number.MAX_SAFE_INTEGER))
    }
  }

  return (
    <div
      className="splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize dispute list"
      aria-valuenow={width}
      aria-valuemin={LIST_MIN}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={() => onChange(clamp(LIST_DEFAULT))}
      onKeyDown={onKeyDown}
    />
  )
}
