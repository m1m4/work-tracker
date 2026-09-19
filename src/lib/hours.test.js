import { describe, it, expect } from 'vitest'
import {
  weekBounds,
  dayBounds,
  addWeeks,
  carryOver,
  initialWeekAnchor,
  isCountable,
  weekWithCarry,
  weekTotals,
  formatHours,
  formatDuration,
  hoursParts,
} from './hours.js'

// Tests are pinned to America/New_York (see vite.config.js) so the DST cases are
// deterministic. Events are built from local-time components and converted to
// ISO, mirroring what the Calendar API returns.
const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min).toISOString()

let seq = 0
const timed = (startIso, endIso, extra = {}) => ({
  id: `e${seq++}`,
  summary: 'Work',
  start: { dateTime: startIso },
  end: { dateTime: endIso },
  ...extra,
})

// Week of Sun 2026-03-01 .. Sun 2026-03-08, Sunday-start.
const MARCH_1 = new Date(2026, 2, 1)
const SUNDAY = 0
const MONDAY = 1

function totalsFor(events, anchor = MARCH_1, weekStartsOn = SUNDAY) {
  const { start, end } = weekBounds(anchor, weekStartsOn)
  return weekTotals(events, start, end)
}

describe('weekBounds', () => {
  it('starts the week on the configured day', () => {
    // 2026-03-04 is a Wednesday.
    const wed = new Date(2026, 2, 4)
    expect(weekBounds(wed, SUNDAY).start.getDate()).toBe(1)
    expect(weekBounds(wed, MONDAY).start.getDate()).toBe(2)
  })

  it('leaves a day that is already the week start where it is', () => {
    expect(weekBounds(new Date(2026, 2, 1), SUNDAY).start.getDate()).toBe(1)
  })

  it('spans exactly seven days with an exclusive end', () => {
    const { start, end } = weekBounds(MARCH_1, SUNDAY)
    expect(dayBounds(start, 6)[1].getTime()).toBe(end.getTime())
  })

  it('normalises across a month boundary', () => {
    // 2026-03-02 is a Monday; its Sunday-start week begins 2026-03-01.
    const { start } = weekBounds(new Date(2026, 2, 2), SUNDAY)
    expect(start.getMonth()).toBe(2)
    expect(start.getDate()).toBe(1)
    // The Monday-start week containing Sun 2026-03-01 reaches back to February.
    const { start: prev } = weekBounds(new Date(2026, 2, 1), MONDAY)
    expect(prev.getMonth()).toBe(1)
    expect(prev.getDate()).toBe(23)
  })
})

describe('addWeeks', () => {
  it('moves forward and backward by whole weeks', () => {
    expect(addWeeks(MARCH_1, 1).getDate()).toBe(8)
    expect(addWeeks(MARCH_1, -1).getMonth()).toBe(1)
    expect(addWeeks(MARCH_1, -1).getDate()).toBe(22)
  })
})

describe('initialWeekAnchor', () => {
  // 2026-03-01 is a Sunday, so the week runs Sun 1st to Sat 7th.
  const weekOf = (date) => weekBounds(initialWeekAnchor(date), SUNDAY).start.getDate()

  it('opens on the current week on a working day', () => {
    expect(weekOf(new Date(2026, 2, 1))).toBe(1) // Sunday
    expect(weekOf(new Date(2026, 2, 2))).toBe(1) // Monday
    expect(weekOf(new Date(2026, 2, 4))).toBe(1) // Wednesday
    expect(weekOf(new Date(2026, 2, 5))).toBe(1) // Thursday
  })

  it('opens on the week ahead once the weekend arrives', () => {
    expect(weekOf(new Date(2026, 2, 6))).toBe(8) // Friday
    expect(weekOf(new Date(2026, 2, 7))).toBe(8) // Saturday
  })

  it('rolls into the next month when the weekend ends one', () => {
    // Sat 2026-03-28 sits in the week beginning Sun 2026-03-22; the week ahead
    // starts Sun 2026-03-29.
    const anchor = initialWeekAnchor(new Date(2026, 2, 28))
    const { start } = weekBounds(anchor, SUNDAY)
    expect(start.getMonth()).toBe(2)
    expect(start.getDate()).toBe(29)
  })
})

describe('isCountable', () => {
  it('counts an ordinary timed event', () => {
    expect(isCountable(timed(at(2026, 3, 2, 9), at(2026, 3, 2, 17)))).toBe(true)
  })

  it('skips all-day events', () => {
    const allDay = { id: 'a', start: { date: '2026-03-02' }, end: { date: '2026-03-03' } }
    expect(isCountable(allDay)).toBe(false)
  })

  it('skips cancelled events', () => {
    const e = timed(at(2026, 3, 2, 9), at(2026, 3, 2, 17), { status: 'cancelled' })
    expect(isCountable(e)).toBe(false)
  })

  it('skips events marked Free', () => {
    const e = timed(at(2026, 3, 2, 9), at(2026, 3, 2, 17), { transparency: 'transparent' })
    expect(isCountable(e)).toBe(false)
  })

  it('skips events the user declined', () => {
    const e = timed(at(2026, 3, 2, 9), at(2026, 3, 2, 17), {
      attendees: [{ self: true, responseStatus: 'declined' }],
    })
    expect(isCountable(e)).toBe(false)
  })

  it('still counts an event someone else declined', () => {
    const e = timed(at(2026, 3, 2, 9), at(2026, 3, 2, 17), {
      attendees: [
        { email: 'other@example.com', responseStatus: 'declined' },
        { self: true, responseStatus: 'accepted' },
      ],
    })
    expect(isCountable(e)).toBe(true)
  })
})

describe('weekTotals', () => {
  it('sums a normal Monday-to-Friday week', () => {
    const events = [2, 3, 4, 5, 6].map((d) => timed(at(2026, 3, d, 9), at(2026, 3, d, 17)))
    const { days, total } = totalsFor(events)
    expect(total).toBe(40)
    expect(days).toEqual([0, 8, 8, 8, 8, 8, 0])
  })

  it('splits an overnight shift across two days', () => {
    const { days, total } = totalsFor([timed(at(2026, 3, 3, 22), at(2026, 3, 4, 2))])
    expect(total).toBe(4)
    expect(days[2]).toBe(2) // Tuesday 22:00-24:00
    expect(days[3]).toBe(2) // Wednesday 00:00-02:00
  })

  it('clips an event straddling the end of the week', () => {
    // Saturday 22:00 into the following Sunday 02:00.
    const { days, total } = totalsFor([timed(at(2026, 3, 7, 22), at(2026, 3, 8, 2))])
    expect(total).toBe(2)
    expect(days[6]).toBe(2)
  })

  it('ignores events entirely outside the week', () => {
    expect(totalsFor([timed(at(2026, 3, 9, 9), at(2026, 3, 9, 17))]).total).toBe(0)
  })

  it('ignores zero-length and inverted events', () => {
    const zero = timed(at(2026, 3, 2, 9), at(2026, 3, 2, 9))
    const inverted = timed(at(2026, 3, 2, 17), at(2026, 3, 2, 9))
    expect(totalsFor([zero, inverted]).total).toBe(0)
  })

  it('counts each expanded instance of a recurring event once', () => {
    // singleEvents=true returns instances sharing a recurringEventId.
    const instances = [2, 3, 4].map((d) =>
      timed(at(2026, 3, d, 9), at(2026, 3, d, 12), { recurringEventId: 'abc' }),
    )
    const { total, counted } = totalsFor(instances)
    expect(total).toBe(9)
    expect(counted).toHaveLength(3)
  })

  it('sums overlapping events rather than merging them', () => {
    const a = timed(at(2026, 3, 2, 9), at(2026, 3, 2, 12))
    const b = timed(at(2026, 3, 2, 11), at(2026, 3, 2, 13))
    expect(totalsFor([a, b]).total).toBe(5)
  })

  it('excludes filtered events from the counted list', () => {
    const events = [
      timed(at(2026, 3, 2, 9), at(2026, 3, 2, 17)),
      timed(at(2026, 3, 3, 9), at(2026, 3, 3, 17), { status: 'cancelled' }),
    ]
    const { counted, total } = totalsFor(events)
    expect(counted).toHaveLength(1)
    expect(total).toBe(8)
  })

  it('returns counted events in chronological order', () => {
    const later = timed(at(2026, 3, 5, 9), at(2026, 3, 5, 10))
    const earlier = timed(at(2026, 3, 2, 9), at(2026, 3, 2, 10))
    const { counted } = totalsFor([later, earlier])
    expect(counted.map((e) => e.start)).toEqual([earlier.start.dateTime, later.start.dateTime])
  })

  it('measures elapsed time, not wall-clock arithmetic, across a DST jump', () => {
    // 2026-03-08 02:00 does not exist in America/New_York: clocks skip to 03:00,
    // so an 01:00-04:00 shift is two hours of actual work.
    const { start, end } = weekBounds(new Date(2026, 2, 8), SUNDAY)
    const { days, total } = weekTotals([timed(at(2026, 3, 8, 1), at(2026, 3, 8, 4))], start, end)
    expect(total).toBe(2)
    expect(days[0]).toBe(2)
  })

  it('keeps a 23-hour DST day intact when clipped by day boundaries', () => {
    const { start, end } = weekBounds(new Date(2026, 2, 8), SUNDAY)
    const shift = timed(at(2026, 3, 8, 0), at(2026, 3, 9, 0))
    expect(weekTotals([shift], start, end).total).toBe(23)
  })
})

describe('carry-over', () => {
  it('passes on only the hours above the cap', () => {
    expect(carryOver(52)).toBe(4)
    expect(carryOver(48)).toBe(0)
    expect(carryOver(40)).toBe(0)
    expect(carryOver(48.25)).toBe(0.25)
  })

  it('honours a cap other than the default', () => {
    expect(carryOver(52, 45)).toBe(7)
    expect(carryOver(52, 60)).toBe(0)
    // The way to switch carry-over off entirely.
    expect(carryOver(100, 168)).toBe(0)
  })

  // Week of Sun 2026-03-08, with the week before it running Sun 2026-03-01.
  const anchor = new Date(2026, 2, 8)
  const bounds = weekBounds(anchor, SUNDAY)

  const longDays = (month, days, hours) =>
    days.map((d) => timed(at(2026, month, d, 8), at(2026, month, d, 8 + hours)))

  it('carries a long previous week into this one', () => {
    // 6 x 9h = 54h the week before, so 6h spills over.
    const events = longDays(3, [1, 2, 3, 4, 5, 6], 9)
    expect(weekWithCarry(events, bounds.start, bounds.end).carriedIn).toBe(6)
  })

  it('applies the configured cap to the carry-in', () => {
    const events = longDays(3, [1, 2, 3, 4, 5, 6], 9) // 54h
    expect(weekWithCarry(events, bounds.start, bounds.end, 50).carriedIn).toBe(4)
    expect(weekWithCarry(events, bounds.start, bounds.end, 60).carriedIn).toBe(0)
  })

  it('carries nothing from a previous week inside the cap', () => {
    const events = longDays(3, [2, 3, 4, 5, 6], 8) // 40h
    expect(weekWithCarry(events, bounds.start, bounds.end).carriedIn).toBe(0)
  })

  it('leaves the displayed week totals untouched by the carry', () => {
    const events = [
      ...longDays(3, [1, 2, 3, 4, 5, 6], 9), // previous week, 54h
      ...longDays(3, [9, 10], 5), // this week, 10h
    ]
    const result = weekWithCarry(events, bounds.start, bounds.end)
    expect(result.total).toBe(10)
    expect(result.carriedIn).toBe(6)
    expect(result.counted).toHaveLength(2)
  })

  it('ignores weeks further back than the one immediately before', () => {
    // A huge week two weeks ago must not reach this one.
    const events = longDays(2, [22, 23, 24, 25, 26, 27], 10)
    expect(weekWithCarry(events, bounds.start, bounds.end).carriedIn).toBe(0)
  })
})

describe('formatting', () => {
  it('formats whole hours without a fraction', () => {
    expect(formatHours(0)).toBe('0h')
    expect(formatHours(12)).toBe('12h')
    // Close enough to whole that the fraction would be noise.
    expect(formatHours(7.999999)).toBe('8h')
  })

  it('formats quarter hours as fractions', () => {
    expect(formatHours(12.5)).toBe('12½h')
    expect(formatHours(6.25)).toBe('6¼h')
    expect(formatHours(6.75)).toBe('6¾h')
  })

  it('drops the leading zero for a bare fraction', () => {
    expect(formatHours(0.5)).toBe('½h')
    expect(formatHours(0.25)).toBe('¼h')
    expect(formatHours(0.75)).toBe('¾h')
  })

  it('falls back to a decimal rather than rounding real minutes away', () => {
    // 6h 18m is not a fraction we render, and snapping it to 6 1/4 would lose
    // three minutes of actual work.
    expect(formatHours(6.3)).toBe('6.3h')
    expect(formatHours(7.1)).toBe('7.1h')
  })

  it('leaves thirds as decimals, since the display font has no glyph for them', () => {
    expect(formatHours(6 + 1 / 3)).toBe('6.3h')
    expect(formatHours(6 + 2 / 3)).toBe('6.7h')
  })

  it('formats a week of quarter-hour days as a fraction', () => {
    const events = [2, 3, 4, 5, 6].map((d) => timed(at(2026, 3, d, 9), at(2026, 3, d, 16, 15)))
    expect(formatHours(totalsFor(events).total)).toBe('36¼h')
  })

  it('splits the parts so the ring can scale the fraction down', () => {
    expect(hoursParts(36.25)).toEqual({ value: '36', fraction: '¼', unit: 'h' })
    expect(hoursParts(36)).toEqual({ value: '36', fraction: '', unit: 'h' })
    expect(hoursParts(6.3)).toEqual({ value: '6.3', fraction: '', unit: 'h' })
  })

  it('reports an empty whole part for a bare fraction', () => {
    // The ring renders this one full size - the fraction is the whole number.
    expect(hoursParts(0.5)).toEqual({ value: '', fraction: '½', unit: 'h' })
  })

  it('formats durations as hours and minutes', () => {
    expect(formatDuration(12.5)).toBe('12h 30m')
    expect(formatDuration(0.75)).toBe('45m')
    expect(formatDuration(3)).toBe('3h')
  })
})
