// Shading for the daily bars: a cold, quiet day through to a scorcher.
//
// The scale is deliberately not the week's own range. Normalising to the
// busiest day would paint a two-hour Tuesday scarlet on a quiet week, which
// says "big day" about a small one. The reference is a full day's work - the
// weekly goal spread over five days - and it only stretches past that when a
// day genuinely went further.

const WORKING_DAYS = 5

export const HEAT_LEVELS = 4

/** Hours that count as a full day, for the week being shown. */
export function heatReference(days, goalHours) {
  const fullDay = goalHours > 0 ? goalHours / WORKING_DAYS : 0
  return Math.max(fullDay, 0, ...days)
}

// Upper bound of each level below the top one, as a fraction of a full day.
const BREAKS = [0.35, 0.65, 0.9]

/** 0 for a day with nothing on it, then 1 (coldest) to HEAT_LEVELS (hottest). */
export function heatLevel(hours, reference) {
  if (!(hours > 0)) return 0
  if (!(reference > 0)) return HEAT_LEVELS
  const ratio = hours / reference
  for (let i = 0; i < BREAKS.length; i++) {
    if (ratio <= BREAKS[i]) return i + 1
  }
  return HEAT_LEVELS
}
