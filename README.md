# Work Tracker

A mobile-first web app that counts the hours you have already logged in Google
Calendar and tracks them against a weekly goal.

Read-only: it never creates, edits, or deletes anything on your calendar.

## How it works

There is no backend. Google Identity Services' token client runs the whole OAuth
flow in the browser, and the Calendar API is called directly with CORS. The
result is a static bundle on GitHub Pages with nothing to deploy, pay for, or
keep warm.

The trade-off is session length. A browser-only client cannot obtain a refresh
token — that requires the authorization-code flow, and Google's token endpoint
demands a client secret for Web application clients, which cannot live in a
public bundle. So:

- Within roughly an hour, every open and reload is instant and silent.
- After that, the app still shows your last known numbers immediately, then
  tries to renew. Renewal needs a popup, and browsers block popups that are not
  triggered by a tap, so you may see a **Tap to refresh** button. One tap, no
  password, no consent screen.

All of that lives in [`src/auth/gis.js`](src/auth/gis.js). If the tap ever
becomes annoying, a small token-refresh backend can be swapped in by changing
that one file.

## Setup

### 1. Google Cloud

All of this is under **Google Auth Platform** in the left menu at
[console.cloud.google.com](https://console.cloud.google.com).

1. **Create a project**, then **APIs & Services → Library → Google Calendar API
   → Enable**.
2. **Google Auth Platform → Get started.** Enter an app name and your support
   email, set **Audience** to **External**, add a contact email, accept the user
   data policy, and click **Create**.
3. **Audience → Test users → Add users.** Add your own Google address. Until the
   app is published, only addresses listed here can sign in.
4. **Data Access → Add or remove scopes.** Filter for `calendar.readonly`, tick
   `https://www.googleapis.com/auth/calendar.readonly`, click **Update**, then
   **Save**. This is the only scope the app uses.
5. **Clients → Create client → Web application.** Under **Authorized JavaScript
   origins** add:
   - `http://localhost:5173`
   - `https://m1m4.github.io`

   Leave **Authorized redirect URIs** empty — the token client does not use one.
   Copy the **Client ID** it gives you.

Nothing else happens in the console. The first time you tap **Connect Google
Calendar** in the app, Google will show a "Google hasn't verified this app"
screen, because `calendar.readonly` is a *sensitive* scope and the project is in
Testing. Click **Advanced → Go to (your app name)**. You will only see it once,
and verification is only required above 100 users.

### 2. Local

```bash
cp .env.example .env.local   # then paste your client ID into it
npm install
npm run dev
```

Open <http://localhost:5173>.

### 3. Deploy

In the GitHub repo:

1. **Settings → Pages → Source: GitHub Actions.**
2. **Settings → Secrets and variables → Actions → Variables → New variable**,
   named `VITE_GOOGLE_CLIENT_ID`. A *variable*, not a secret: OAuth client IDs
   for public clients are meant to be published, and the build needs it inlined.

Pushing to `main` runs the tests and publishes. Open the Pages URL on your phone
and use **Add to Home Screen** — the manifest and service worker make it launch
standalone and paint cached numbers instantly.

## How hours are counted

All arithmetic happens in your phone's local timezone. The rules live in
[`src/lib/hours.js`](src/lib/hours.js) and each has a test in
[`src/lib/hours.test.js`](src/lib/hours.test.js).

Counted:

- Timed events on any calendar you ticked in Settings.
- Each occurrence of a recurring event, expanded separately.
- Only the part of an event that falls inside the week. An overnight shift is
  split across the two days it touches.

Not counted:

- **All-day events** — they have no start time and would each add 24 hours.
- **Events marked Free** — reminders and holds, not worked time.
- **Events you declined.**
- **Cancelled events.**

Two deliberate choices worth knowing:

- **Overlapping events are summed, not merged.** Two overlapping work events
  count twice. Predictable beats clever, and double-booking is usually a signal
  you want to see rather than hide.
- **The week runs Sunday to Saturday**, fixed rather than configurable.

The collapsible list under the chart shows every event that was counted, so a
total you disagree with can be traced without leaving the app.

You can page backwards and forwards through weeks with the arrows; tap the week
title to jump back to the current one. Future weeks show what is already
scheduled, which doubles as a rough forecast.

## Staying current

Events you add to Google Calendar show up on their own. Google can only push
calendar changes to a webhook, which needs a server to receive it, so a
backend-free app has to ask instead:

- **Returning to the app refreshes it.** This is the case that matters - adding
  an event usually means switching to the calendar app and back.
- **While it is open and in front, it re-checks every 45 seconds.**
- Nothing is requested while the app is in the background, and two refreshes are
  never fired within 20 seconds of each other.
- If the access token has expired, no request is made at all. Renewing it needs
  a popup, and a background refresh has no tap behind it - so the **Tap to
  refresh** button appears instead.

## Commands

```bash
npm run dev      # dev server on :5173
npm test         # unit tests for the hour maths
npm run build    # production bundle into dist/
npm run preview  # serve dist/ locally
npm run icons    # regenerate public/icon-*.png
```

## Notes

- Settings live in `localStorage`, so they are per-device and do not sync.
- **Theme** follows the system by default, with Auto / Light / Dark under
  **Look** in Settings. The document always carries a resolved `data-theme` of
  `light` or `dark` - never `system` - so the stylesheet needs one dark block
  instead of a media query plus an override that can drift. An inline script in
  `index.html` applies the stored choice before first paint, which is what stops
  the theme flashing on load; it reads `wt.settings.theme` directly, so renaming
  that field means updating `index.html` too.
- The service worker caches the app shell only, never API responses — a stale
  hour count would be worse than a brief spinner.
- Recharts is loaded lazily, so the ring and the headline number paint without
  waiting for the chart.
- The interface is neobrutalist: thick borders, hard offset shadows, flat
  colour. Space Grotesk is loaded from Google Fonts for headings and the big
  number only; body text stays on the system stack.
