import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// App-shell caching only, so the page opens instantly on a home-screen launch.
// Registered after load so it never competes with the first paint.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    // Relative, so it resolves under /<repo>/ on GitHub Pages and takes that
    // same path as its scope.
    navigator.serviceWorker
      .register('sw.js')
      .catch(() => {
        // Offline shell is a nicety; the app works fine without it.
      })
  })
}
