// Theme handling.
//
// The document always carries a resolved data-theme of exactly "light" or
// "dark" - never "system". Resolving in JS rather than leaning on a CSS media
// query means the stylesheet needs one dark block instead of two near-identical
// ones, and a manual override cannot drift out of sync with the system query.
//
// index.html sets the initial value inline before first paint, so there is no
// flash of the wrong theme on load.

export const THEMES = [
  { value: 'system', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

// Kept in step with --paper in styles.css; used for the browser chrome colour.
const PAPER = { light: '#fdf3e3', dark: '#100f14' }

const DARK_QUERY = '(prefers-color-scheme: dark)'

export function isTheme(value) {
  return THEMES.some((t) => t.value === value)
}

function systemTheme() {
  return window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light'
}

export function resolveTheme(theme) {
  return theme === 'light' || theme === 'dark' ? theme : systemTheme()
}

export function applyTheme(theme) {
  const resolved = resolveTheme(theme)
  document.documentElement.dataset.theme = resolved

  // Tints the status bar on iOS and the address bar on Android.
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', PAPER[resolved])

  return resolved
}

/**
 * Calls back when the OS flips between light and dark. Only meaningful while
 * the setting is "system"; returns a cleanup function either way.
 */
export function watchSystemTheme(onChange) {
  const query = window.matchMedia?.(DARK_QUERY)
  if (!query) return () => {}

  const handler = () => onChange(systemTheme())
  query.addEventListener('change', handler)
  return () => query.removeEventListener('change', handler)
}
