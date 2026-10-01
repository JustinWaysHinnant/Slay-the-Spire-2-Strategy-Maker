interface LoginProps {
  apiUrl: string
  error?: string
  onLogin: () => void
}

export function Login({ apiUrl, error, onLogin }: LoginProps) {
  const configured = Boolean(apiUrl)
  return <main className="login-shell">
    <section className="login-card panel" aria-labelledby="login-heading">
      <div className="brand login-brand"><span className="brand-mark">Ⅱ</span><div><strong>SLAY THE SPIRE 2</strong><small>STRATEGY MAKER</small></div></div>
      <p className="eyebrow">Personal intelligence</p>
      <h1 id="login-heading">Your climb starts here.</h1>
      <p className="login-copy">Sign in through Steam to open your dashboard. Steam verifies your account; this app receives only your verified SteamID64.</p>
      {error ? <p className="login-error" role="alert">{error}</p> : null}
      <button className="steam-login" onClick={onLogin} disabled={!configured}>
        <span aria-hidden="true">◉</span> Sign in through Steam
      </button>
      {!configured ? <p className="login-help">The secure Steam login service has not been configured yet.</p> : null}
      <p className="privacy-note">Your imported run files stay in this browser and are not sent to the login service.</p>
    </section>
  </main>
}
