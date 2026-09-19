import { WEEK_STARTS_ON, weekBounds } from '../lib/hours.js'

function sameWeek(a, b) {
  return (
    weekBounds(a, WEEK_STARTS_ON).start.getTime() === weekBounds(b, WEEK_STARTS_ON).start.getTime()
  )
}

function rangeLabel(weekStart) {
  const end = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6)
  const sameMonth = weekStart.getMonth() === end.getMonth()
  const from = weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const to = end.toLocaleDateString(undefined, {
    month: sameMonth ? undefined : 'short',
    day: 'numeric',
  })
  return `${from} – ${to}`
}

export default function Header({ anchor, weekStart, onPrev, onNext, onToday, onSettings, busy }) {
  const isCurrent = sameWeek(anchor, new Date())
  const isFuture = weekStart > weekBounds(new Date(), WEEK_STARTS_ON).start

  let title = 'This week'
  if (!isCurrent) title = isFuture ? 'Ahead' : 'Back then'

  return (
    <header className="header">
      <button className="icon-btn" onClick={onPrev} aria-label="Previous week">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>

      {/* Tapping the title jumps back to the current week - no extra button. */}
      <button
        className="header-title"
        onClick={onToday}
        disabled={isCurrent}
        aria-label={isCurrent ? undefined : 'Back to this week'}
      >
        <span className="header-week">
          {title}
          {busy && <span className="header-spinner" aria-hidden="true" />}
        </span>
        <span className="header-range">{rangeLabel(weekStart)}</span>
      </button>

      <button className="icon-btn" onClick={onNext} aria-label="Next week">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>

      <button className="icon-btn" onClick={onSettings} aria-label="Settings">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 9h16M4 16h16" />
          <circle cx="9" cy="9" r="2.6" fill="var(--surface)" />
          <circle cx="16" cy="16" r="2.6" fill="var(--surface)" />
        </svg>
      </button>
    </header>
  )
}
