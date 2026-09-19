export default function ConnectScreen({ onConnect, connecting, error }) {
  return (
    <div className="connect">
      <div className="connect-badge" aria-hidden="true">
        <svg viewBox="0 0 32 32">
          <rect
            x="3"
            y="6"
            width="26"
            height="23"
            rx="4"
            fill="var(--accent)"
            stroke="var(--line)"
            strokeWidth="2.5"
          />
          <path d="M3 13h26" stroke="var(--line)" strokeWidth="2.5" />
          <path d="M10 3v5M22 3v5" stroke="var(--line)" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>

      <h1 className="connect-title">
        Work
        <br />
        Tracker
      </h1>

      <p className="connect-copy">
        You already write it all down in Google Calendar. This just does the adding up, so you can
        stop counting squares on a screen.
      </p>

      <ul className="connect-facts">
        <li>Read-only. It cannot touch your calendar.</li>
        <li>No middleman. Google talks straight to your phone.</li>
      </ul>

      {error && <div className="notice is-error">{error}</div>}

      <button className="btn btn-primary btn-big" onClick={onConnect} disabled={connecting}>
        {connecting ? 'Hold on…' : 'Connect Google Calendar'}
      </button>
    </div>
  )
}
