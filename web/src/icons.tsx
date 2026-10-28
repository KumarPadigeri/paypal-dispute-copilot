// Small stroke icons (16px) drawn inline, so there is no icon library to load.
// They take the text color of their parent (currentColor).

const base = {
  width: 14,
  height: 14,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export const ReplyIcon = () => (
  <svg {...base}>
    <path d="M6.5 4L3 7.5 6.5 11" />
    <path d="M3 7.5h6.5a3.5 3.5 0 013.5 3.5v1" />
  </svg>
)

export const ClockIcon = () => (
  <svg {...base}>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 5v3.2l2 1.3" />
  </svg>
)

export const CheckIcon = () => (
  <svg {...base}>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M5.6 8.2l1.7 1.7 3.2-3.4" />
  </svg>
)
