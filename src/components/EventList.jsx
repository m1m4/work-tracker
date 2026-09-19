import { formatDuration } from '../lib/hours.js'

// Shows exactly what was counted, so a total that looks wrong can be traced
// without leaving the app.

function timeRange(startIso, endIso) {
  const options = { hour: 'numeric', minute: '2-digit' }
  const start = new Date(startIso).toLocaleTimeString(undefined, options)
  const end = new Date(endIso).toLocaleTimeString(undefined, options)
  return `${start} – ${end}`
}

function dayLabel(startIso) {
  // Composed rather than passed as one options object: some locales order a
  // weekday+day format as "14 Mon", which reads oddly in a list like this.
  const date = new Date(startIso)
  const weekday = date.toLocaleDateString(undefined, { weekday: 'short' })
  return `${weekday} ${date.getDate()}`
}

export default function EventList({ events }) {
  if (!events?.length) return null

  return (
    <details className="card events">
      <summary className="events-summary">
        {events.length} {events.length === 1 ? 'event' : 'events'} counted
      </summary>
      <ul className="events-list">
        {events.map((event) => (
          <li key={`${event.calendarId}:${event.id}:${event.start}`} className="events-item">
            <div className="events-main">
              <div className="events-title">{event.summary}</div>
              <div className="events-meta">
                {dayLabel(event.start)} &middot; {timeRange(event.start, event.end)}
              </div>
            </div>
            <div className="events-hours">{formatDuration(event.hours)}</div>
          </li>
        ))}
      </ul>
    </details>
  )
}
