// The app's sense of humour. Dry, never nagging - this thing sits next to a
// number about how much you have worked, so it should not make you feel bad for
// a slow Monday or smug about a 60-hour week.

const PAST = [
  { upTo: 0, lines: ['A blank canvas.', 'Nothing yet. Bold.', 'The week is but an infant.'] },
  { upTo: 0.25, lines: ['Warming up.', 'Baby steps.', "It's a start."] },
  { upTo: 0.5, lines: ['Momentum detected.', 'Halfway to halfway.', 'Getting somewhere.'] },
  { upTo: 0.75, lines: ['Over the hump.', 'Now we are talking.', 'Comfortably underway.'] },
  { upTo: 0.99, lines: ['So close.', 'One more decent day.', 'Nearly. Painfully nearly.'] },
  { upTo: 1.25, lines: ['Nailed it.', 'Goal met. Go outside.', 'Done. Shut the laptop.'] },
  { upTo: Infinity, lines: ['Overachiever.', 'Touch grass.', 'Log off. Seriously.'] },
]

const FUTURE = [
  { upTo: 0, lines: ['Gloriously empty.', 'Nothing booked. Suspicious.', 'A week of pure potential.'] },
  { upTo: 0.5, lines: ['Lightly booked.', 'Room to breathe.', 'Manageable.'] },
  { upTo: 0.99, lines: ['Filling up.', 'Shaping up nicely.', 'Almost a full week.'] },
  { upTo: Infinity, lines: ['Future you is busy.', 'Booked solid.', 'Good luck with that.'] },
]

const LOADING = [
  'Counting…',
  'Doing the maths…',
  'Asking Google nicely…',
  'Adding it all up…',
  'Consulting the calendar…',
]

/**
 * Stable per week rather than random per render, so the line does not flicker
 * on every state change - but still varies as you move between weeks.
 */
function pick(lines, seed) {
  return lines[Math.abs(seed) % lines.length]
}

function seedFrom(date) {
  return date.getFullYear() * 400 + date.getMonth() * 31 + date.getDate()
}

export function progressQuip(hours, goal, weekStart, isFuture) {
  const progress = goal > 0 ? hours / goal : 0
  const table = isFuture ? FUTURE : PAST
  const bucket = table.find((b) => progress <= b.upTo) ?? table[table.length - 1]
  return pick(bucket.lines, seedFrom(weekStart))
}

export function loadingQuip() {
  return pick(LOADING, Math.floor(Date.now() / 1000))
}
