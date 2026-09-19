import { BarChart, Bar, XAxis, Cell, ResponsiveContainer, LabelList } from 'recharts'
import { dayBounds, formatHours } from '../lib/hours.js'
import { heatLevel, heatReference } from '../lib/heat.js'

// Lazy-loaded from App so Recharts stays off the critical path.

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function isToday(date) {
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

/**
 * Colour now carries the workload, so today is called out in ink instead.
 *
 * Passed to XAxis as a function, not as an element. Recharts 3 accepts both,
 * but the element form throws "Cannot convert object to primitive value" from
 * inside its own tick cloning and takes the whole chart down with it.
 */
function DayTick({ x, y, payload, today }) {
  const isIt = payload.value === today
  return (
    <text
      x={x}
      y={y + 13}
      textAnchor="middle"
      fontSize={12}
      fontWeight={700}
      fill={isIt ? 'var(--ink)' : 'var(--muted)'}
    >
      {payload.value}
    </text>
  )
}

export default function DailyBars({ days, weekStart, goal }) {
  const data = days.map((hours, i) => {
    const [dayStart] = dayBounds(weekStart, i)
    return {
      label: DAY_LABELS[dayStart.getDay()],
      // Deliberately unrounded: formatHours needs the exact value to recognise
      // a quarter or a third, and rounding here would turn 6.25 into 6.3.
      hours,
      today: isToday(dayStart),
    }
  })

  const hasAny = data.some((d) => d.hours > 0)
  const reference = heatReference(days, goal)
  const todayLabel = data.find((d) => d.today)?.label

  return (
    <section className="card chart-card">
      <h2 className="card-title">Day by day</h2>
      {hasAny ? (
        <div className="chart">
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={data} margin={{ top: 22, right: 2, bottom: 0, left: 2 }}>
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                // eslint-disable-next-line react/no-unstable-nested-components
                tick={(props) => <DayTick {...props} today={todayLabel} />}
              />
              <Bar dataKey="hours" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                <LabelList
                  dataKey="hours"
                  position="top"
                  fontSize={11}
                  fontWeight={700}
                  fill="var(--ink)"
                  formatter={(value) => (value > 0 ? formatHours(value) : '')}
                />
                {data.map((entry, i) => (
                  <Cell
                    key={i}
                    // One hue, deepening as the day fills up, so the shape of
                    // the week is readable before the numbers are.
                    fill={`var(--heat-${heatLevel(entry.hours, reference) || 1})`}
                    stroke="var(--line)"
                    // Today wears the heavier outline.
                    strokeWidth={entry.today ? 4 : 2}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="empty">Not a single minute. Enjoy it while it lasts.</p>
      )}
    </section>
  )
}
