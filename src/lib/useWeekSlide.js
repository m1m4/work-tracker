import { useCallback, useEffect, useRef } from 'react'

// Paging between weeks: the gesture and the movement that goes with it.
//
// The content is moved by writing to the node's style directly rather than by
// holding an offset in state. A drag fires dozens of events a second and the
// pane contains the chart, so re-rendering React on every frame of a swipe is
// the one thing guaranteed to make this feel worse than no animation at all.
//
// Nothing calls preventDefault, so vertical scrolling stays completely native.

const MIN_DISTANCE = 56
// Vertical travel allowed as a fraction of horizontal travel before the gesture
// is treated as a scroll rather than a swipe.
const MAX_DRIFT = 0.6
const MAX_DURATION_MS = 800

// Once a gesture has moved this far its axis is decided and stays decided, so a
// diagonal drag cannot flicker between scrolling and paging halfway through.
const AXIS_LOCK_PX = 12

// Past this the content stops following the finger one-for-one. A long drag
// still reads as a gesture instead of hauling the week off the screen.
const RESIST_AFTER = 90
const RESISTANCE = 0.32

// Short, because this sits between a tap and the answer.
const EXIT_MS = 130
const ENTER_MS = 190
// How far a week travels on its way out, as a fraction of the pane's width.
const TRAVEL = 0.34

function damp(dx) {
  const over = Math.abs(dx) - RESIST_AFTER
  if (over <= 0) return dx
  return Math.sign(dx) * (RESIST_AFTER + over * RESISTANCE)
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

// A hidden tab throttles its compositor, so a transition started there can sit
// on its first frame indefinitely - which would leave the pane parked off to
// one side at zero opacity. Nobody is watching it anyway, so skip the motion.
function shouldAnimate() {
  return document.visibilityState === 'visible' && !prefersReducedMotion()
}

/**
 * @param onPrev  commit the move to the previous week
 * @param onNext  commit the move to the next week
 * @returns ref to put on the pane, touch handlers to spread on it, and slide()
 *          so the header arrows move the same way a swipe does
 */
export function useWeekSlide({ onPrev, onNext }) {
  const ref = useRef(null)
  const start = useRef(null)
  const axis = useRef(null)
  const timers = useRef([])
  const animating = useRef(false)

  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  useEffect(() => clearTimers, [])

  const move = useCallback((x, opacity, ms) => {
    const el = ref.current
    if (!el) return
    el.style.transition = ms ? `transform ${ms}ms ease-out, opacity ${ms}ms ease-out` : 'none'
    el.style.transform = x ? `translate3d(${x}px, 0, 0)` : ''
    el.style.opacity = opacity < 1 ? String(opacity) : ''
  }, [])

  const settle = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.transition = ''
    el.style.transform = ''
    el.style.opacity = ''
  }, [])

  // direction: 1 to travel forwards, -1 to travel back. `commit` defaults to
  // the one-week step, and is passed explicitly for the jump back to today,
  // which moves in a direction but not by a single week.
  const slide = useCallback(
    (direction, commit = direction > 0 ? onNext : onPrev) => {
      const el = ref.current
      // No guard on a slide already running: tapping an arrow twice quickly
      // should move two weeks, even if the second move cuts the first short.
      // A swipe is different - see onTouchStart.
      if (!el || !shouldAnimate()) {
        clearTimers()
        animating.current = false
        settle()
        commit?.()
        return
      }

      clearTimers()
      animating.current = true
      const distance = el.offsetWidth * TRAVEL

      // Out the way the finger was going...
      move(-direction * distance, 0, EXIT_MS)

      timers.current.push(
        setTimeout(() => {
          commit?.()
          // ...and the week that replaces it enters from the other side. The
          // jump has to land before the transition is attached, hence the
          // forced reflow: without it the browser coalesces both writes and
          // the new week simply appears.
          move(direction * distance, 0, 0)
          void el.offsetWidth
          move(0, 1, ENTER_MS)
          timers.current.push(
            setTimeout(() => {
              animating.current = false
              settle()
            }, ENTER_MS),
          )
        }, EXIT_MS),
      )
    },
    [onNext, onPrev, move, settle],
  )

  const handlers = {
    onTouchStart(event) {
      axis.current = null
      // A second finger means a pinch, not a swipe.
      if (event.touches.length !== 1 || animating.current) {
        start.current = null
        return
      }
      const touch = event.touches[0]
      start.current = { x: touch.clientX, y: touch.clientY, at: Date.now() }
    },

    onTouchMove(event) {
      const from = start.current
      if (!from) return
      if (event.touches.length !== 1) {
        start.current = null
        move(0, 1, ENTER_MS)
        return
      }

      const touch = event.touches[0]
      const dx = touch.clientX - from.x
      const dy = touch.clientY - from.y

      if (!axis.current) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_LOCK_PX) return
        axis.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      }
      if (axis.current !== 'x') return

      move(damp(dx), 1, 0)
    },

    onTouchEnd(event) {
      const from = start.current
      const wasHorizontal = axis.current === 'x'
      start.current = null
      axis.current = null
      if (!from || !wasHorizontal) return

      const touch = event.changedTouches[0]
      const dx = touch.clientX - from.x
      const dy = touch.clientY - from.y

      const farEnough = Math.abs(dx) >= MIN_DISTANCE
      const straightEnough = Math.abs(dy) <= Math.abs(dx) * MAX_DRIFT
      const quickEnough = Date.now() - from.at <= MAX_DURATION_MS

      // Content follows the finger: dragging left brings the next week in.
      if (farEnough && straightEnough && quickEnough) slide(dx < 0 ? 1 : -1)
      else move(0, 1, ENTER_MS)
    },

    onTouchCancel() {
      start.current = null
      axis.current = null
      move(0, 1, ENTER_MS)
    },
  }

  return { ref, handlers, slide }
}
