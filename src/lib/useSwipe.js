import { useRef } from 'react'

// Horizontal swipe detection for paging between weeks.
//
// Nothing calls preventDefault, so vertical scrolling stays completely native.
// The direction is decided on touchend instead: a gesture only counts as a swipe
// if it travelled far enough, stayed roughly horizontal, and happened quickly.
// Anything else was the user scrolling the page.

const MIN_DISTANCE = 56
// Vertical travel allowed as a fraction of horizontal travel before the gesture
// is treated as a scroll rather than a swipe.
const MAX_DRIFT = 0.6
const MAX_DURATION_MS = 800

export function useSwipe({ onLeft, onRight }) {
  const start = useRef(null)

  return {
    onTouchStart(event) {
      // A second finger means a pinch or a zoom, not a swipe.
      if (event.touches.length !== 1) {
        start.current = null
        return
      }
      const touch = event.touches[0]
      start.current = { x: touch.clientX, y: touch.clientY, at: Date.now() }
    },

    onTouchMove(event) {
      if (event.touches.length !== 1) start.current = null
    },

    onTouchEnd(event) {
      const from = start.current
      start.current = null
      if (!from) return

      const touch = event.changedTouches[0]
      const dx = touch.clientX - from.x
      const dy = touch.clientY - from.y

      if (Math.abs(dx) < MIN_DISTANCE) return
      if (Math.abs(dy) > Math.abs(dx) * MAX_DRIFT) return
      if (Date.now() - from.at > MAX_DURATION_MS) return

      // Content follows the finger: dragging left brings the next week in.
      if (dx < 0) onLeft?.()
      else onRight?.()
    },

    onTouchCancel() {
      start.current = null
    },
  }
}
