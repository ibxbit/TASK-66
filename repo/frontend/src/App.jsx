import { useEffect, useMemo, useState } from 'react';
import AnalyticsTab from './components/AnalyticsTab';
import AuditTab from './components/AuditTab';
import AuthPanel from './components/AuthPanel';
import CuratorTab from './components/CuratorTab';
import ExportsTab from './components/ExportsTab';
import FeatureGuard from './components/FeatureGuard';
import GuidedNavigationTab from './components/GuidedNavigationTab';
import InboxTab from './components/InboxTab';
import ProgramsTab from './components/ProgramsTab';
import RouteBuilderTab from './components/RouteBuilderTab';
import SearchDiscoveryTab from './components/SearchDiscoveryTab';
import StaffingTab from './components/StaffingTab';
import { useFormState } from './hooks/useFormState';
import { getInitialLoginForm } from './lib/auth-defaults';
import {
  apiBase,
  apiRequest,
  clearSecuritySensitiveClientState,
  setApiAuthContext,
  syncOfflineQueue
} from './lib/api';
import { clearQueuedWrites, getQueueSize } from './lib/offline';
import { tabs, hasTabAccess, PUBLIC_TABS } from './lib/tabs';

const getInitialTabFromHash = () => {
  const hash = window.location.hash.replace('#', '').trim();
  return tabs.some((tab) => tab.id === hash) ? hash : 'search';
};

function App() {
  const [activeTab, setActiveTab] = useState(getInitialTabFromHash());
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [auth, setAuth] = useState({
    user: null,
    csrfToken: '',
    stepUpToken: ''
  });
  const [queueSize, setQueueSize] = useState(getQueueSize());
  const [sessionNonce, setSessionNonce] = useState(0);

  const [loginForm, updateLogin, setLoginForm] = useFormState(getInitialLoginForm());
  const [stepUpPassword, setStepUpPassword] = useState('');
  const [verifyAction, setVerifyAction] = useState('GRAPH_PUBLISH');
  const [pending, setPending] = useState({
    login: false,
    logout: false,
    refresh: false,
    stepUpVerify: false,
    queueSync: false
  });

  const roles = auth.user?.roles || [];
  const allowedTabs = useMemo(() => tabs.filter((tab) => hasTabAccess(roles, tab.id)), [roles]);

  const hasAccess = (tabId) => hasTabAccess(roles, tabId);

  const setPendingState = (key, value) => setPending((prev) => ({ ...prev, [key]: value }));

  const resetSessionScopedState = () => {
    setSessionNonce((prev) => prev + 1);
    setStepUpPassword('');
    setMessage('');
    setError('');
    setActiveTab('search');
    window.history.replaceState(null, '', '#search');
  };

  const runAction = async (key, fn) => {
    if (pending[key]) {
      return;
    }
    setPendingState(key, true);
    setError('');
    setMessage('');
    try {
      await fn();
      setQueueSize(getQueueSize());
    } catch (err) {
      setError(err.message || 'Request failed');
    } finally {
      setPendingState(key, false);
    }
  };

  useEffect(() => {
    const onOnline = async () => {
      const result = await syncOfflineQueue();
      setQueueSize(result.remaining);
      if (result.synced > 0) {
        setMessage(`Synced ${result.synced} queued write(s)`);
      }
    };
    const onStorage = () => setQueueSize(getQueueSize());
    const onHashChange = () => {
      const nextTab = getInitialTabFromHash();
      setActiveTab(nextTab);
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('storage', onStorage);
    window.addEventListener('hashchange', onHashChange);
    const interval = setInterval(() => setQueueSize(getQueueSize()), 4000);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('hashchange', onHashChange);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    setApiAuthContext({
      userId: auth.user?.id,
      csrfToken: auth.csrfToken,
      stepUpToken: auth.stepUpToken
    });
  }, [auth.user?.id, auth.csrfToken, auth.stepUpToken]);

  const navigateToTab = (tabId) => {
    setActiveTab(tabId);
    window.history.replaceState(null, '', `#${tabId}`);
  };

  const login = () =>
    runAction('login', async () => {
      const response = await apiRequest({ path: '/auth/login', method: 'POST', body: loginForm, allowQueue: false });
      const csrf = response.data?.csrfToken || '';
      const nextUser = response.data?.user || null;
      if (auth.user?.id && auth.user.id !== nextUser?.id) {
        clearQueuedWrites();
        await clearSecuritySensitiveClientState();
        resetSessionScopedState();
      }
      setAuth({ csrfToken: csrf, stepUpToken: '', user: nextUser });
      setLoginForm(getInitialLoginForm());
      setMessage(`Signed in as ${response.data.user.username}`);
    });

  const logout = () =>
    runAction('logout', async () => {
      await apiRequest({ path: '/auth/logout', method: 'POST', csrfToken: auth.csrfToken, allowQueue: false });
      clearQueuedWrites();
      await clearSecuritySensitiveClientState();
      resetSessionScopedState();
      setAuth({ user: null, csrfToken: '', stepUpToken: '' });
      setMessage('Signed out');
    });

  const refreshMe = () =>
    runAction('refresh', async () => {
      const response = await apiRequest({ path: '/auth/me', method: 'GET', allowQueue: false });
      setAuth((prev) => ({ ...prev, user: response.data.user }));
      setMessage('Session refreshed');
    });

  const acquireStepUpTokenFor = async (action) => {
    if (!stepUpPassword) {
      throw new Error('Enter step-up password before sensitive actions');
    }
    const response = await apiRequest({
      path: '/auth/step-up',
      method: 'POST',
      body: { password: stepUpPassword, action },
      csrfToken: auth.csrfToken,
      allowQueue: false
    });
    setAuth((prev) => ({ ...prev, stepUpToken: response.data.stepUpToken }));
    return response.data;
  };

  const verifyStepUp = () =>
    runAction('stepUpVerify', async () => {
      const result = await acquireStepUpTokenFor(verifyAction);
      setMessage(`Step-up token for ${result.action} valid until ${result.validUntil}`);
    });

  const syncQueueNow = () =>
    runAction('queueSync', async () => {
      const result = await syncOfflineQueue();
      setQueueSize(result.remaining);
      setMessage(`Synced ${result.synced}, remaining ${result.remaining}`);
    });

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <p className="product">Philatelic Museum Operations Suite</p>
          <h1>Operations Console</h1>
          <p className="hint">Backend API: {apiBase}</p>
        </div>
        <div className="status-grid">
          <span className={navigator.onLine ? 'pill online' : 'pill offline'}>{navigator.onLine ? 'Online' : 'Offline'}</span>
          <span className="pill">Queued writes: {queueSize}</span>
          <button className="ghost" onClick={syncQueueNow} disabled={pending.queueSync}>
            {pending.queueSync ? 'Syncing...' : 'Sync Queue'}
          </button>
        </div>
      </header>

      <AuthPanel
        loginForm={loginForm}
        updateLogin={updateLogin}
        login={login}
        refreshMe={refreshMe}
        logout={logout}
        pending={pending}
        stepUpPassword={stepUpPassword}
        setStepUpPassword={setStepUpPassword}
        verifyAction={verifyAction}
        setVerifyAction={setVerifyAction}
        verifyStepUp={verifyStepUp}
        user={auth.user}
      />

      <nav className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? 'tab active' : 'tab'}
            onClick={() => navigateToTab(tab.id)}
            disabled={!hasAccess(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {message ? <p className="notice ok">{message}</p> : null}
      {error ? <p className="notice err">{error}</p> : null}

      <section className="content-grid">
        {activeTab === 'search' ? (
          <FeatureGuard canAccess={hasAccess('search')} tabId="search">
            <SearchDiscoveryTab
              key={`search-${sessionNonce}`}
              apiRequest={apiRequest}
              csrfToken={auth.csrfToken}
              canCurateKeywords={hasAccess('curator')}
              setMessage={setMessage}
              setError={setError}
            />
          </FeatureGuard>
        ) : null}

        {activeTab === 'curator' ? (
          <FeatureGuard canAccess={hasAccess('curator')} tabId="curator">
            <CuratorTab
              key={`curator-${sessionNonce}`}
              apiRequest={apiRequest}
              csrfToken={auth.csrfToken}
              acquireStepUpTokenFor={acquireStepUpTokenFor}
              setMessage={setMessage}
              setError={setError}
            />
          </FeatureGuard>
        ) : null}

        {activeTab === 'routes' ? (
          <FeatureGuard canAccess={hasAccess('routes')} tabId="routes">
            <RouteBuilderTab
              key={`routes-${sessionNonce}`}
              apiRequest={apiRequest}
              csrfToken={auth.csrfToken}
              setMessage={setMessage}
              setError={setError}
              acquireStepUpTokenFor={acquireStepUpTokenFor}
            />
          </FeatureGuard>
        ) : null}

        {activeTab === 'navigation' ? (
          <FeatureGuard canAccess={hasAccess('navigation')} tabId="navigation">
            <GuidedNavigationTab
              key={`navigation-${sessionNonce}`}
              apiRequest={apiRequest}
              setMessage={setMessage}
              setError={setError}
            />
          </FeatureGuard>
        ) : null}

        {activeTab === 'programs' ? (
          <FeatureGuard canAccess={hasAccess('programs')} tabId="programs">
            <ProgramsTab
              key={`programs-${sessionNonce}`}
              apiRequest={apiRequest}
              csrfToken={auth.csrfToken}
              setMessage={setMessage}
              setError={setError}
            />
          </FeatureGuard>
        ) : null}

        {activeTab === 'staffing' ? (
          <FeatureGuard canAccess={hasAccess('staffing')} tabId="staffing">
            <StaffingTab
              key={`staffing-${sessionNonce}`}
              apiRequest={apiRequest}
              csrfToken={auth.csrfToken}
              roles={roles}
              acquireStepUpTokenFor={acquireStepUpTokenFor}
              setMessage={setMessage}
              setError={setError}
            />
          </FeatureGuard>
        ) : null}

        {activeTab === 'analytics' ? (
          <FeatureGuard canAccess={hasAccess('analytics')} tabId="analytics">
            <AnalyticsTab
              key={`analytics-${sessionNonce}`}
              apiRequest={apiRequest}
              csrfToken={auth.csrfToken}
              setMessage={setMessage}
              setError={setError}
            />
          </FeatureGuard>
        ) : null}

        {activeTab === 'exports' ? (
          <FeatureGuard canAccess={hasAccess('exports')} tabId="exports">
            <ExportsTab
              key={`exports-${sessionNonce}`}
              apiRequest={apiRequest}
              csrfToken={auth.csrfToken}
              acquireStepUpTokenFor={acquireStepUpTokenFor}
              setMessage={setMessage}
              setError={setError}
            />
          </FeatureGuard>
        ) : null}

        {activeTab === 'inbox' ? (
          <FeatureGuard canAccess={hasAccess('inbox')} tabId="inbox">
            <InboxTab
              key={`inbox-${sessionNonce}`}
              apiRequest={apiRequest}
              csrfToken={auth.csrfToken}
              setMessage={setMessage}
              setError={setError}
            />
          </FeatureGuard>
        ) : null}

        {activeTab === 'audit' ? (
          <FeatureGuard canAccess={hasAccess('audit')} tabId="audit">
            <AuditTab
              key={`audit-${sessionNonce}`}
              apiRequest={apiRequest}
              setMessage={setMessage}
              setError={setError}
            />
          </FeatureGuard>
        ) : null}
      </section>

      <footer className="footer">Allowed tabs: {allowedTabs.map((tab) => tab.label).join(' | ') || 'none'}</footer>
    </main>
  );
}

export default App;
