export const getInitialLoginForm = () => {
  const allowPrefill =
    import.meta?.env?.MODE !== 'production' &&
    String(import.meta?.env?.VITE_ENABLE_DEV_LOGIN_PREFILL || '').toLowerCase() === 'true';

  if (!allowPrefill) {
    return { username: '', password: '' };
  }

  const username = import.meta?.env?.VITE_DEV_LOGIN_USERNAME || '';
  const password = import.meta?.env?.VITE_DEV_LOGIN_PASSWORD || '';

  if (!username || !password) {
    return { username: '', password: '' };
  }

  return { username, password };
};
