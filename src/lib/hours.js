// Turning calendar events into hours. All arithmetic happens in the browser's
// local timezone, which is what "my work week" means to a human.
//
// This is the module most likely to be subtly wrong, so every rule below has a
// corresponding case in hours.test.js.

const MS_PER_HOUR = 3600000

/**
 * The work week starts on Sunday. Fixed rather than configurable: it matches how
 * this is actually used, and one fewer setting is one fewer thing to get wrong.
 * weekBounds still takes the day as an argument so the behaviour stays testable.
 */
export const WEEK_STARTS_ON = 0

/**
 * Local-midnight bounds of the week containing `date`. End is exclusive.
 * Dates are built via the (y, m, d) constructor so day arithmetic stays
 * DST-safe: the engine resolves each local midnight to a real instant.
 */
export function weekBounds(date, weekStartsOn) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const back = (d.getDay() - weekStartsOn + 7) % 7
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back)
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7)
  return { start, end }
}

/** Local-midnight bounds of day `i` (0-6) of the week starting at `weekStart`. */
export function dayBounds(weekStart, i) {
  const y = weekStart.getFullYear()
  const m = weekStart.getMonth()
  const d = weekStart.getDate()
  return [new Date(y, m, d + i), new Date(y, m, d + i + 1)]
}

export function addWeeks(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n * 7)
}

/**
 * Whether an event represents time actually worked.
 *
 * All-day events are excluded because they carry `start.date` rather than
 * `start.dateTime` and would each contribute a full 24 hours. Events marked
 * Free are reminders, not worked time. Declined events never happened.
 */
export function isCountable(event) {
  if (!event) return false
  if (event.status === 'cancelled') return false
  if (event.transparency === 'transparent') return false
  if (!event.start?.dateTime || !event.end?.dateTime) return false
  const self = event.attendees?.find((a) => a.self)
  if (self?.responseStatus === 'declined') return false
  return true
}

/**
 * Per-day hours for one week, plus the events that produced them.
 *
 * Events are clipped to the week and to each day, so an overnight shift splits
 * across two days and a shift straddling the week boundary only contributes the
 * part that falls inside. Overlapping events are summed as-is rather than
 * merged - two overlapping work events count twice.
 */
export function weekTotals(events, weekStart, weekEnd) {
  const days = new Array(7).fill(0)
  const counted = []
  const bounds = Array.from({ length: 7 }, (_, i) => dayBounds(weekStart, i))

  for (const event of events) {
    if (!isCountable(event)) continue

    const start = new Date(event.start.dateTime)
    const end = new Date(event.end.dateTime)
    if (!(end > start)) continue
    if (end <= weekStart || start >= weekEnd) continue

    let hours = 0
    for (let i = 0; i < 7; i++) {
      const overlap = Math.min(end, bounds[i][1]) - Math.max(start, bounds[i][0])
      if (overlap > 0) {
        days[i] += overlap / MS_PER_HOUR
        hours += overlap / MS_PER_HOUR
      }
    }

    if (hours > 0) {
      counted.push({
        id: event.id,
        summary: event.summary || '(no title)',
        calendarId: event.calendarId,
        start: start.toISOString(),
        end: end.toISOString(),
        hours,
      })
    }
  }

  counted.sort((a, b) => a.start.localeCompare(b.start))
  return { days, total: days.reduce((a, b) => a + b, 0), counted }
}

// Calendar events land on neat boundaries far more often than not, and "6.3h"
// is both uglier and less exact than "6¼h" for the same 6h 15m.
//
// Quarters only. Thirds would cover 20-minute events, but ⅓ and ⅔ live in the
// Number Forms block, which Space Grotesk does not carry - they fall back to
// another face and render as visibly mismatched glyphs mid-number. Anything
// without a fraction here keeps its decimal.
const FRACTIONS = [
  { value: 1 / 4, glyph: '¼' },
  { value: 1 / 2, glyph: '½' },
  { value: 3 / 4, glyph: '¾' },
]

// Six seconds. Tight enough that nothing is mislabelled, loose enough to absorb
// the floating point drift from summing milliseconds.
const EPSILON = 1 / 600

/** 7.5 -> "7½h", 8 -> "8h", 0.5 -> "½h", 6.3 -> "6.3h". */
export function formatHours(h) {
  const whole = Math.floor(h + EPSILON)
  const remainder = h - whole

  if (remainder < EPSILON) return `${whole}h`

  const fraction = FRACTIONS.find((f) => Math.abs(remainder - f.value) < EPSILON)
  // No clean fraction: keep the decimal rather than rounding real minutes away.
  if (!fraction) return `${Math.round(h * 10) / 10}h`

  return whole ? `${whole}${fraction.glyph}h` : `${fraction.glyph}h`
}

/** 12.5 -> "12h 30m", for the per-event list where precision reads better. */
export function formatDuration(h) {
  const totalMinutes = Math.round(h * 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (!hours) return `${minutes}m`
  if (!minutes) return `${hours}h`
  return `${hours}h ${minutes}m`
}

/**
 * The same text formatHours produces, split so a caller can style the parts.
 * The big ring needs this because the fraction glyph has to be scaled down to
 * sit correctly next to full-size digits.
 */
export function hoursParts(h) {
  const text = formatHours(h)
  const index = text.search(/[¼½¾]/)
  if (index === -1) return { value: text.slice(0, -1), fraction: '', unit: 'h' }
  return { value: text.slice(0, index), fraction: text[index], unit: 'h' }
}
