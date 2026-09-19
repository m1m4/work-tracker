import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Header from './components/Header.jsx'
import GoalRing from './components/GoalRing.jsx'
import EventList from './components/EventList.jsx'
import Settings from './components/Settings.jsx'
import ConnectScreen from './components/ConnectScreen.jsx'
import Loader from './components/Loader.jsx'
import {
  addWeeks,
  initialWeekAnchor,
  WEEK_STARTS_ON,
  weekBounds,
  weekWithCarry,
} from './lib/hours.js'
import { listCalendars, listEventsForCalendars } from './api/calendar.js'
import {
  clearWeekCache,
  loadSettings,
  readWeekCache,
  saveSettings,
  writeWeekCache,
} from './lib/storage.js'
import {
  getAccessToken,
  hasConnectedBefore,
  hasFreshToken,
  POPUP_BLOCKED,
  signOut,
} from './auth/gis.js'
import { applyTheme, watchSystemTheme } from './lib/theme.js'
import { useWeekSlide } from './lib/useWeekSlide.js'

// Recharts is the only heavy dependency, so the chart streams in after the ring.
const DailyBars = lazy(() => import('./components/DailyBars.jsx'))

// A blocked or dismissed popup is not an error - it means we need a tap.
const NEEDS_GESTURE = new Set([POPUP_BLOCKED, 'popup_closed'])

// Google has no way to push calendar changes to a page without a backend to
// receive the webhook, so staying current means asking. The interval covers the
// app being left open; coming back to the foreground is the case that actually
// matters, since adding an event usually means switching to the calendar app and
// back. The floor stops a flurry of focus events turning into a flurry of
// requests.
const POLL_MS = 45_000
const MIN_GAP_MS = 20_000

export default function App() {
  const [connected, setConnected] = useState(hasConnectedBefore)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState(null)

  const [settings, setSettings] = useState(loadSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [anchor, setAnchor] = useState(initialWeekAnchor)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [error, setError] = useState(null)

  const [calendars, setCalendars] = useState([])
  const [calendarsStatus, setCalendarsStatus] = useState('idle')
  const [calendarsError, setCalendarsError] = useState(null)

  const { start: weekStart, end: weekEnd } = useMemo(
    () => weekBounds(anchor, WEEK_STARTS_ON),
    [anchor],
  )

  const isFuture = useMemo(
    () => weekStart > weekBounds(new Date(), WEEK_STARTS_ON).start,
    [weekStart],
  )

  const { calendarIds, theme, carryOverAbove } = settings
  const hasCalendars = calendarIds.length > 0

  const goPrev = useCallback(() => setAnchor((a) => addWeeks(a, -1)), [])
  const goNext = useCallback(() => setAnchor((a) => addWeeks(a, 1)), [])

  // Attached to <main> rather than the whole app, so gestures inside the
  // settings sheet never page the week behind it.
  const { ref: paneRef, handlers: swipe, slide } = useWeekSlide({
    onPrev: goPrev,
    onNext: goNext,
  })

  // The arrows and the title move the week the same way a swipe does, so the
  // motion says which direction you went however you asked for it.
  // Today is any number of weeks away, so the step is spelled out: travel back
  // if we are ahead of it, forwards if we are behind.
  const goToday = useCallback(
    () => slide(isFuture ? -1 : 1, () => setAnchor(new Date())),
    [slide, isFuture],
  )

  // index.html applies the stored theme before first paint; this keeps it in
  // step afterwards, and follows the OS while the setting is "Auto".
  useEffect(() => {
    applyTheme(theme)
    if (theme !== 'system') return undefined
    return watchSystemTheme(() => applyTheme('system'))
  }, [theme])

  // Guards against a slow fetch for an earlier week overwriting a newer one.
  const requestId = useRef(0)
  const lastLoadAt = useRef(0)

  const load = useCallback(async () => {
    if (!connected || !calendarIds.length) return

    const id = ++requestId.current
    lastLoadAt.current = Date.now()
    setLoading(true)
    // Clear any previous failure: it describes the last attempt, not this one,
    // and leaving it up makes an in-flight load look broken.
    setNeedsRefresh(false)
    setError(null)
    try {
      // One query covering this week and the one before it: the previous week's
      // logged total is what decides how many hours carry in.
      const events = await listEventsForCalendars(calendarIds, addWeeks(weekStart, -1), weekEnd)
      const totals = weekWithCarry(events, weekStart, weekEnd, carryOverAbove)
      if (id !== requestId.current) return

      writeWeekCache(calendarIds, weekStart, totals)
      setData({ ...totals, fetchedAt: Date.now() })
      setNeedsRefresh(false)
      setError(null)
    } catch (err) {
      if (id !== requestId.current) return
      if (NEEDS_GESTURE.has(err.code)) setNeedsRefresh(true)
      else setError(err.message || 'Could not load your calendar.')
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [connected, calendarIds, weekStart, weekEnd, carryOverAbove])

  // Paint whatever is cached for this week first, then revalidate.
  useEffect(() => {
    if (!connected) return
    setData(readWeekCache(calendarIds, weekStart))
    load()
  }, [connected, calendarIds, weekStart, load])

  // Keep the week current as events are added, without needing a manual tap.
  useEffect(() => {
    if (!connected || !hasCalendars) return undefined

    const refreshIfDue = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastLoadAt.current < MIN_GAP_MS) return
      // A background refresh has no user gesture behind it, so renewing an
      // expired token would need a popup the browser will block. Surface the
      // tap instead of firing a request that cannot succeed.
      if (!hasFreshToken()) {
        setNeedsRefresh(true)
        return
      }
      load()
    }

    document.addEventListener('visibilitychange', refreshIfDue)
    window.addEventListener('focus', refreshIfDue)
    window.addEventListener('online', refreshIfDue)
    const timer = setInterval(refreshIfDue, POLL_MS)

    return () => {
      document.removeEventListener('visibilitychange', refreshIfDue)
      window.removeEventListener('focus', refreshIfDue)
      window.removeEventListener('online', refreshIfDue)
      clearInterval(timer)
    }
  }, [connected, hasCalendars, load])

  const loadCalendars = useCallback(async () => {
    setCalendarsStatus('loading')
    setCalendarsError(null)
    try {
      setCalendars(await listCalendars())
      setCalendarsStatus('ready')
    } catch (err) {
      setCalendarsStatus('error')
      setCalendarsError(
        NEEDS_GESTURE.has(err.code)
          ? 'Reconnect to Google to load your calendars.'
          : err.message || 'Could not load your calendars.',
      )
    }
  }, [])

  useEffect(() => {
    if (connected && settingsOpen && calendarsStatus === 'idle') loadCalendars()
  }, [connected, settingsOpen, calendarsStatus, loadCalendars])

  async function handleConnect() {
    setConnecting(true)
    setConnectError(null)
    try {
      await getAccessToken()
      setConnected(true)
      // Nothing can be counted until calendars are chosen, so go straight there.
      setSettingsOpen(true)
    } catch (err) {
      if (err.code !== 'popup_closed') setConnectError(err.message)
    } finally {
      setConnecting(false)
    }
  }

  async function handleSignOut() {
    await signOut()
    clearWeekCache()
    setConnected(false)
    setSettingsOpen(false)
    setData(null)
    setCalendars([])
    setCalendarsStatus('idle')
    setNeedsRefresh(false)
    setError(null)
  }

  function updateSettings(patch) {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      saveSettings(next)
      return next
    })
  }

  if (!connected) {
    return <ConnectScreen onConnect={handleConnect} connecting={connecting} error={connectError} />
  }

  return (
    <div className="app">
      <Header
        anchor={anchor}
        weekStart={weekStart}
        onPrev={() => slide(-1)}
        onNext={() => slide(1)}
        onToday={goToday}
        onSettings={() => setSettingsOpen(true)}
        busy={loading && Boolean(data)}
      />

      {needsRefresh && (
        <div className="notice">
          <span>{data ? 'These numbers are from earlier.' : 'Google logged you out.'}</span>
          <button className="link-btn" onClick={load}>
            Tap to refresh
          </button>
        </div>
      )}

      {error && (
        <div className="notice is-error">
          <span>{error}</span>
          <button className="link-btn" onClick={load}>
            Retry
          </button>
        </div>
      )}

      <main className="main" ref={paneRef} {...swipe}>
        {!hasCalendars ? (
          <div className="card empty-state">
            <p className="empty-state-lead">Nothing is counted yet.</p>
            <p>Tell it which calendars are work and it will do the rest.</p>
            <button className="btn btn-primary" onClick={() => setSettingsOpen(true)}>
              Pick calendars
            </button>
          </div>
        ) : loading && !data ? (
          <Loader />
        ) : (
          <>
            <GoalRing
              logged={data?.total ?? 0}
              carriedIn={data?.carriedIn ?? 0}
              carryOverAbove={carryOverAbove}
              goal={settings.goalHours}
              weekStart={weekStart}
              isFuture={isFuture}
            />

            {data && (
              <Suspense fallback={<div className="card chart-placeholder" />}>
                <DailyBars days={data.days} weekStart={weekStart} />
              </Suspense>
            )}

            {data && <EventList events={data.counted} />}
          </>
        )}
      </main>

      {settingsOpen && (
        <Settings
          settings={settings}
          calendars={calendars}
          calendarsStatus={calendarsStatus}
          calendarsError={calendarsError}
          onChange={updateSettings}
          onReloadCalendars={loadCalendars}
          onClose={() => setSettingsOpen(false)}
          onSignOut={handleSignOut}
        />
      )}
    </div>
  )
}
