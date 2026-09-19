import { useEffect, useState } from 'react'
import { loadingQuip } from '../lib/quips.js'

// Three calendars tumbling end over end. The stagger is what sells it - they
// fall out of sync and then briefly line up again.

function CalendarIcon({ day, delay }) {
  return (
    <svg className="tumbler" viewBox="0 0 32 32" style={{ animationDelay: delay }} aria-hidden="true">
      <rect
        x="3"
        y="6"
        width="26"
        height="23"
        rx="4"
        fill="var(--surface)"
        stroke="var(--line)"
        strokeWidth="2.5"
      />
      <path d="M3 13h26" stroke="var(--line)" strokeWidth="2.5" />
      <path d="M10 3v5M22 3v5" stroke="var(--line)" strokeWidth="2.5" strokeLinecap="round" />
      <text
        x="16"
        y="24"
        textAnchor="middle"
        fontSize="10"
        fontWeight="700"
        fill="var(--ink)"
        fontFamily="inherit"
      >
        {day}
      </text>
    </svg>
  )
}

export default function Loader() {
  const [message, setMessage] = useState(loadingQuip)

  // Swap the line if the wait drags on, so a slow network looks alive.
  useEffect(() => {
    const timer = setInterval(() => setMessage(loadingQuip()), 2200)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="loader" role="status" aria-live="polite">
      <div className="loader-icons" aria-hidden="true">
        <CalendarIcon day="1" delay="0s" />
        <CalendarIcon day="2" delay="0.14s" />
        <CalendarIcon day="3" delay="0.28s" />
      </div>
      <p className="loader-text">{message}</p>
    </div>
  )
}
