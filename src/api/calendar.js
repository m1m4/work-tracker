// Google Calendar REST client. The API sends CORS headers, so the browser talks
// to it directly - no proxy, no backend.

import { getAccessToken, clearStoredToken } from '../auth/gis.js'

const BASE = 'https://www.googleapis.com/calendar/v3'

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function apiGet(path, params = {}, { retryOn401 = true } = {}) {
  const token = await getAccessToken()
  const url = new URL(BASE + path)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
  }

  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })

  if (response.status === 401 && retryOn401) {
    // Token revoked or invalidated ahead of its stated expiry. Drop it and let
    // getAccessToken mint a fresh one, but only once.
    clearStoredToken()
    return apiGet(path, params, { retryOn401: false })
  }

  if (!response.ok) {
    const detail = await response
      .json()
      .then((body) => body?.error?.message)
      .catch(() => null)
    throw new ApiError(response.status, detail || `Calendar API returned ${response.status}`)
  }

  return response.json()
}

/** Follow nextPageToken until the API stops handing them out. */
async function apiGetAll(path, params) {
  const items = []
  let pageToken

  do {
    const page = await apiGet(path, { ...params, pageToken })
    if (page.items) items.push(...page.items)
    pageToken = page.nextPageToken
  } while (pageToken)

  return items
}

/** Every calendar on the account, for the picker in Settings. */
export async function listCalendars() {
  const items = await apiGetAll('/users/me/calendarList', { maxResults: 250, minAccessRole: 'reader' })
  return items.map((cal) => ({
    id: cal.id,
    summary: cal.summaryOverride || cal.summary || cal.id,
    color: cal.backgroundColor || '#4f6bed',
    primary: Boolean(cal.primary),
    selected: Boolean(cal.selected),
  }))
}

/**
 * Events from one calendar overlapping [timeMin, timeMax).
 *
 * singleEvents expands recurring events into concrete instances, without which
 * a weekly standing meeting would be counted once instead of every week.
 */
export async function listEvents(calendarId, timeMin, timeMax) {
  const items = await apiGetAll(`/calendars/${encodeURIComponent(calendarId)}/events`, {
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 2500,
    // Only the fields hours.js actually reads.
    fields:
      'nextPageToken,items(id,summary,status,transparency,start,end,attendees(self,responseStatus),recurringEventId)',
  })
  return items.map((event) => ({ ...event, calendarId }))
}

/** Events across every selected calendar, fetched in parallel. */
export async function listEventsForCalendars(calendarIds, timeMin, timeMax) {
  const perCalendar = await Promise.all(
    calendarIds.map((id) => listEvents(id, timeMin, timeMax)),
  )
  return perCalendar.flat()
}
