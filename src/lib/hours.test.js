import { describe, it, expect } from 'vitest'
import {
  weekBounds,
  dayBounds,
  addWeeks,
  isCountable,
  weekTotals,
  formatHours,
  formatDuration,
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

describe('formatting', () => {
  it('formats hours to one decimal', () => {
    expect(formatHours(12.5)).toBe('12.5h')
    expect(formatHours(12)).toBe('12h')
    expect(formatHours(0)).toBe('0h')
    expect(formatHours(7.049)).toBe('7h')
  })

  it('formats durations as hours and minutes', () => {
    expect(formatDuration(12.5)).toBe('12h 30m')
    expect(formatDuration(0.75)).toBe('45m')
    expect(formatDuration(3)).toBe('3h')
  })
})
