import { formatHours, hoursParts } from '../lib/hours.js'
import { progressQuip } from '../lib/quips.js'

// Hand-rolled SVG rather than a charting component: this is the first thing on
// screen, and it should not wait for the chart bundle.

const SIZE = 220
const STROKE = 22
const RADIUS = (SIZE - STROKE) / 2 - 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export default function GoalRing({ hours, goal, weekStart, isFuture }) {
  const progress = goal > 0 ? Math.min(hours / goal, 1) : 0
  const remaining = Math.max(goal - hours, 0)
  const met = goal > 0 && hours >= goal
  const percent = Math.round(progress * 100)
  const quip = progressQuip(hours, goal, weekStart, isFuture)

  const { value, fraction, unit } = hoursParts(hours)

  return (
    <section className={met ? 'card ring-card is-met' : 'card ring-card'}>
      <div className="ring">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="ring-svg"
          role="img"
          aria-label={`${formatHours(hours)} of ${formatHours(goal)} goal, ${percent} percent`}
        >
          <circle
            className="ring-track"
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            strokeWidth={STROKE}
            fill="none"
          />
          <circle
            className="ring-value"
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            strokeWidth={STROKE}
            fill="none"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
            // Start the arc at twelve o'clock instead of three.
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        </svg>

        <div className="ring-label">
          <div className="ring-hours">
            {value}
            {/* A fraction with no whole part is the whole number, so it keeps
                full size; alongside digits it scales down. */}
            {fraction && (
              <span className={value ? 'ring-fraction' : undefined}>{fraction}</span>
            )}
            <span className="ring-unit">{unit}</span>
          </div>
          <div className="ring-goal">of {formatHours(goal)}</div>
        </div>
      </div>

      <div className="ring-footer">
        <div className="ring-remaining">
          {met ? 'Goal met' : `${formatHours(remaining)} to go`}
        </div>
        <div className="ring-quip">{quip}</div>
      </div>
    </section>
  )
}
