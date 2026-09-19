import { useEffect, useState } from 'react'
import { THEMES } from '../lib/theme.js'

export default function Settings({
  settings,
  calendars,
  calendarsStatus,
  calendarsError,
  onChange,
  onReloadCalendars,
  onClose,
  onSignOut,
}) {
  // The goal is edited as a string so the field can be empty mid-typing without
  // snapping back to a number.
  const [goalText, setGoalText] = useState(String(settings.goalHours))

  useEffect(() => {
    setGoalText(String(settings.goalHours))
  }, [settings.goalHours])

  function commitGoal() {
    const value = Number(goalText)
    if (Number.isFinite(value) && value > 0) {
      onChange({ goalHours: Math.min(value, 168) })
    } else {
      setGoalText(String(settings.goalHours))
    }
  }

  function toggleCalendar(id) {
    const selected = settings.calendarIds.includes(id)
    onChange({
      calendarIds: selected
        ? settings.calendarIds.filter((c) => c !== id)
        : [...settings.calendarIds, id],
    })
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-header">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close settings">
            &#10005;
          </button>
        </div>

        <div className="sheet-body">
          <label className="field">
            <span className="field-label">Weekly goal</span>
            <div className="field-input">
              <input
                type="number"
                inputMode="decimal"
                min="1"
                max="168"
                step="0.5"
                value={goalText}
                onChange={(e) => setGoalText(e.target.value)}
                onBlur={commitGoal}
              />
              <span className="field-suffix">hours</span>
            </div>
          </label>

          <div className="field">
            <span className="field-label">Look</span>
            <div className="segmented">
              {THEMES.map((theme) => (
                <button
                  key={theme.value}
                  className={settings.theme === theme.value ? 'is-active' : ''}
                  aria-pressed={settings.theme === theme.value}
                  onClick={() => onChange({ theme: theme.value })}
                >
                  {theme.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field-label">What counts as work</span>

            {calendarsStatus === 'loading' && <p className="empty">Loading calendars&hellip;</p>}

            {calendarsError && (
              <div className="notice is-error">
                <span>{calendarsError}</span>
                <button className="link-btn" onClick={onReloadCalendars}>
                  Retry
                </button>
              </div>
            )}

            {calendarsStatus === 'ready' && !calendars.length && (
              <p className="empty">No calendars on this account. Impressive.</p>
            )}

            <ul className="calendars">
              {calendars.map((calendar) => (
                <li key={calendar.id}>
                  <label className="calendar">
                    <input
                      type="checkbox"
                      checked={settings.calendarIds.includes(calendar.id)}
                      onChange={() => toggleCalendar(calendar.id)}
                    />
                    <span className="calendar-dot" style={{ background: calendar.color }} />
                    <span className="calendar-name">{calendar.summary}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <button className="btn btn-quiet" onClick={onSignOut}>
            Sign out
          </button>
        </div>

        <div className="sheet-footer">
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
