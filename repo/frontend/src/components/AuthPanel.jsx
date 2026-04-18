function AuthPanel({
  loginForm,
  updateLogin,
  login,
  refreshMe,
  logout,
  pending,
  stepUpPassword,
  setStepUpPassword,
  verifyStepUp,
  verifyAction,
  setVerifyAction,
  user
}) {
  const isLoggedIn = Boolean(user?.id);

  return (
    <section className="auth-panel card">
      <h2>Auth</h2>
      <div className="row">
        <input value={loginForm.username} onChange={(e) => updateLogin('username', e.target.value)} placeholder="username" />
        <input value={loginForm.password} onChange={(e) => updateLogin('password', e.target.value)} placeholder="password" type="password" />
        <button onClick={login} disabled={pending.login || pending.logout}>Sign In</button>
        <button onClick={refreshMe} disabled={!isLoggedIn || pending.refresh}>Refresh Session</button>
        <button onClick={logout} disabled={!isLoggedIn || pending.logout}>Sign Out</button>
      </div>
      <div className="row">
        <input value={stepUpPassword} onChange={(e) => setStepUpPassword(e.target.value)} placeholder="step-up password" type="password" />
        <select value={verifyAction} onChange={(e) => setVerifyAction(e.target.value)}>
          <option value="GRAPH_PUBLISH">GRAPH_PUBLISH</option>
          <option value="ROUTE_RULE_CHANGE">ROUTE_RULE_CHANGE</option>
          <option value="JOB_APPROVE">JOB_APPROVE</option>
          <option value="JOB_APPEAL_DECIDE">JOB_APPEAL_DECIDE</option>
          <option value="EXPORT_CREATE">EXPORT_CREATE</option>
          <option value="ADMIN_CONFIG_UPDATE">ADMIN_CONFIG_UPDATE</option>
        </select>
        <button onClick={verifyStepUp} disabled={!isLoggedIn || pending.stepUpVerify}>Verify Step-Up</button>
        <span className="small">User: {user?.username || 'none'} / roles: {(user?.roles || []).join(', ') || 'none'}</span>
      </div>
      <p className="small">Sensitive actions require step-up verification and will fail fast with actionable error feedback.</p>
    </section>
  );
}

export default AuthPanel;
