import { useEffect, useState } from 'react'
import { THEMES } from '../lib/theme.js'

/**
 * A number field that commits on blur.
 *
 * The value is held as a string while editing so the box can be empty
 * mid-typing without snapping back; anything invalid reverts on blur rather
 * than writing a nonsense setting.
 */
function HoursField({ label, hint, value, onCommit }) {
  const [text, setText] = useState(String(value))

  useEffect(() => {
    setText(String(value))
  }, [value])

  function commit() {
    const parsed = Number(text)
    if (Number.isFinite(parsed) && parsed > 0) onCommit(Math.min(parsed, 168))
    else setText(String(value))
  }

  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <div className="field-input">
        <input
          type="number"
          inputMode="decimal"
          min="1"
          max="168"
          step="0.5"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
        />
        <span className="field-suffix">hours</span>
      </div>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

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
          <HoursField
            label="Weekly goal"
            value={settings.goalHours}
            onCommit={(goalHours) => onChange({ goalHours })}
          />

          <HoursField
            label="Spare hours above"
            hint="Anything logged past this rolls into the next week. Set it to 168 to turn that off."
            value={settings.carryOverAbove}
            onCommit={(carryOverAbove) => onChange({ carryOverAbove })}
          />

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
