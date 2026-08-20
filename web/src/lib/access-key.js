const STORAGE_KEY = 'codex-relay-key';

export function consumeDashboardAccessKey() {
  const params = new URLSearchParams(location.hash.slice(1));
  const key = params.get('key');
  if (!key) return;

  sessionStorage.setItem(STORAGE_KEY, key);
  history.replaceState(null, '', location.pathname + location.search);
}

export function getDashboardAccessKey() {
  return sessionStorage.getItem(STORAGE_KEY);
}
