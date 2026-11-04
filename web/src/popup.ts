import { type RefObject, useEffect, useLayoutEffect, useState } from 'react'

/**
 * A popup opened by a button: placed below it (kept on screen at the right edge), closed by Esc,
 * a click outside or a scroll. Esc and picking return focus to the button.
 */
export function usePopup(
  open: boolean,
  setOpen: (open: boolean) => void,
  button: RefObject<HTMLElement | null>,
  popup: RefObject<HTMLElement | null>,
  width = 300,
) {
  const [at, setAt] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !button.current) return
    const r = button.current.getBoundingClientRect()
    setAt({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - width)) })
  }, [open, button, width])

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
  }, [open, setOpen, button, popup])

  return at
}
