// Google OAuth, entirely in the browser.
//
// This app has no backend, so it uses the Google Identity Services *token*
// client: no client secret, no redirect handler, no server. The trade-off is
// that there is no refresh token, so access tokens last about an hour.
//
// Renewal uses prompt: '' which returns a token with no account chooser and no
// consent screen once access has been granted. It still goes through a popup,
// and browsers block popups without user activation - so a renewal attempted on
// page load may fail with POPUP_BLOCKED, and the UI falls back to a button.
//
// Everything session-related lives in this module. Swapping in a token-refresh
// backend later means changing this file and nothing else.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
const STORAGE_KEY = 'wt.token'
const CONNECTED_KEY = 'wt.connected'
const GIS_SRC = 'https://accounts.google.com/gsi/client'

// Renew a minute early rather than discovering expiry via a failed request.
const EXPIRY_MARGIN_MS = 60_000

export const POPUP_BLOCKED = 'popup_blocked'
export const NOT_CONFIGURED = 'not_configured'

export class AuthError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'AuthError'
    this.code = code
  }
}

export function isConfigured() {
  return Boolean(CLIENT_ID)
}

let gisPromise = null

function loadGis() {
  if (gisPromise) return gisPromise
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve(window.google.accounts.oauth2)
      return
    }
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.onload = () => {
      if (window.google?.accounts?.oauth2) resolve(window.google.accounts.oauth2)
      else reject(new AuthError('gis_unavailable', 'Google sign-in failed to initialise.'))
    }
    script.onerror = () => {
      gisPromise = null // allow a retry once connectivity returns
      reject(new AuthError('gis_unreachable', 'Could not reach Google sign-in.'))
    }
    document.head.appendChild(script)
  })
  return gisPromise
}

export function readStoredToken() {
  try {
    const token = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (!token?.accessToken || !token?.expiresAt) return null
    return token
  } catch {
    return null
  }
}

function storeToken(token) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(token))
    localStorage.setItem(CONNECTED_KEY, '1')
  } catch {
    // Private mode or a full quota; the token still works for this page view.
  }
}

export function clearStoredToken() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing useful to do.
  }
}

export function isFresh(token) {
  return Boolean(token) && token.expiresAt > Date.now() + EXPIRY_MARGIN_MS
}

/**
 * True once access has been granted at least once on this device. Tracked
 * separately from the token so that an expired or rejected token still shows
 * the main screen with a refresh prompt, rather than bouncing to Connect.
 */
export function hasConnectedBefore() {
  try {
    return localStorage.getItem(CONNECTED_KEY) === '1'
  } catch {
    return false
  }
}

let inFlight = null

/**
 * Ask Google for an access token. Concurrent callers share one popup.
 * Rejects with AuthError(POPUP_BLOCKED) when called outside a user gesture and
 * the browser refuses to open the window.
 */
function requestToken() {
  if (inFlight) return inFlight

  inFlight = loadGis()
    .then(
      (oauth2) =>
        new Promise((resolve, reject) => {
          const client = oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPE,
            // Silent when a grant already exists; Google still shows consent
            // the first time, which is what we want.
            prompt: '',
            callback: (response) => {
              if (response.error) {
                reject(new AuthError(response.error, response.error_description || 'Sign-in failed.'))
                return
              }
              const token = {
                accessToken: response.access_token,
                expiresAt: Date.now() + (Number(response.expires_in) || 3600) * 1000,
              }
              storeToken(token)
              resolve(token)
            },
            error_callback: (error) => {
              const type = error?.type
              if (type === 'popup_failed_to_open') {
                reject(new AuthError(POPUP_BLOCKED, 'Google sign-in popup was blocked.'))
              } else if (type === 'popup_closed') {
                reject(new AuthError('popup_closed', 'Sign-in was cancelled.'))
              } else {
                reject(new AuthError(type || 'unknown', error?.message || 'Sign-in failed.'))
              }
            },
          })
          client.requestAccessToken()
        }),
    )
    .finally(() => {
      inFlight = null
    })

  return inFlight
}

/**
 * A usable access token, from cache when it is still fresh.
 *
 * When renewal is needed, this opens a popup - so it succeeds reliably only
 * inside a user gesture. Called on page load it may reject with
 * AuthError(POPUP_BLOCKED), which callers treat as "show Tap to refresh"
 * rather than as a failure.
 */
export async function getAccessToken() {
  if (!isConfigured()) {
    throw new AuthError(NOT_CONFIGURED, 'Missing VITE_GOOGLE_CLIENT_ID. See the README.')
  }

  const stored = readStoredToken()
  if (isFresh(stored)) return stored.accessToken

  const token = await requestToken()
  return token.accessToken
}

export async function signOut() {
  const token = readStoredToken()
  clearStoredToken()
  try {
    localStorage.removeItem(CONNECTED_KEY)
  } catch {
    // Nothing useful to do.
  }
  if (!token?.accessToken) return
  try {
    const oauth2 = await loadGis()
    oauth2.revoke(token.accessToken)
  } catch {
    // Local token is already gone; a failed revoke is not worth surfacing.
  }
}
