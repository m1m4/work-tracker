import { BarChart, Bar, XAxis, Cell, ResponsiveContainer, LabelList } from 'recharts'
import { dayBounds, formatHours } from '../lib/hours.js'

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

export default function DailyBars({ days, weekStart }) {
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
  const best = Math.max(...data.map((d) => d.hours))

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
                tick={{ fill: 'var(--muted)', fontSize: 12, fontWeight: 700 }}
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
                    // Today gets the accent; the week's best day gets the second
                    // colour, so the chart says something at a glance.
                    fill={
                      entry.today
                        ? 'var(--accent)'
                        : entry.hours === best && best > 0
                          ? 'var(--hot)'
                          : 'var(--bar)'
                    }
                    stroke="var(--line)"
                    strokeWidth={2}
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
