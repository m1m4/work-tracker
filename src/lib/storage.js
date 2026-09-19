// Settings and the week cache, both in localStorage.
//
// Note: index.html reads wt.settings.theme inline before first paint. Renaming
// that key or field means updating the inline script there too.
//
// Every access is wrapped: localStorage throws in private mode and when the
// quota is full, and losing a cached week is never worth crashing over.

import { isTheme } from './theme.js'

const SETTINGS_KEY = 'wt.settings'
// Bumped when the cache entry shape changes, so old entries are simply missed
// rather than misread.
const CACHE_PREFIX = 'wt.week.v2.'
const CACHE_LIMIT = 12

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function defaultSettings() {
  return {
    goalHours: 40,
    calendarIds: [],
    theme: 'system',
  }
}

export function loadSettings() {
  const stored = read(SETTINGS_KEY, null)
  if (!stored) return defaultSettings()

  const defaults = defaultSettings()
  return {
    goalHours: Number(stored.goalHours) > 0 ? Number(stored.goalHours) : defaults.goalHours,
    calendarIds: Array.isArray(stored.calendarIds) ? stored.calendarIds : [],
    theme: isTheme(stored.theme) ? stored.theme : defaults.theme,
  }
}

export function saveSettings(settings) {
  write(SETTINGS_KEY, settings)
}

/** Local YYYY-MM-DD. toISOString would shift the date in negative-offset zones. */
function localDateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Cache identity: which calendars, and which week. */
function cacheKey(calendarIds, weekStart) {
  return `${CACHE_PREFIX}${localDateKey(weekStart)}|${[...calendarIds].sort().join(',')}`
}

export function readWeekCache(calendarIds, weekStart) {
  if (!calendarIds.length) return null
  const entry = read(cacheKey(calendarIds, weekStart), null)
  if (!entry || !Array.isArray(entry.days) || entry.days.length !== 7) return null
  return entry
}

export function writeWeekCache(calendarIds, weekStart, { days, total, counted }) {
  if (!calendarIds.length) return
  const stored = write(cacheKey(calendarIds, weekStart), {
    days,
    total,
    counted,
    fetchedAt: Date.now(),
  })
  if (stored) pruneCache()
}

/** Keep the most recent CACHE_LIMIT weeks so storage cannot grow without bound. */
function pruneCache() {
  try {
    const entries = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(CACHE_PREFIX)) continue
      entries.push({ key, fetchedAt: read(key, {})?.fetchedAt ?? 0 })
    }
    if (entries.length <= CACHE_LIMIT) return
    entries.sort((a, b) => b.fetchedAt - a.fetchedAt)
    for (const { key } of entries.slice(CACHE_LIMIT)) localStorage.removeItem(key)
  } catch {
    // Pruning is housekeeping; failing it changes nothing the user sees.
  }
}

export function clearWeekCache() {
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(CACHE_PREFIX)) keys.push(key)
    }
    for (const key of keys) localStorage.removeItem(key)
  } catch {
    // Nothing useful to do.
  }
}
