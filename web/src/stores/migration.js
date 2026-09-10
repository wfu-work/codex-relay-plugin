import { computed, reactive } from 'vue';
import { useRelay } from './relay.js';

const { api, state: relay } = useRelay();
const state = reactive({ job: null, prepared: null, loading: false, submitting: false, error: '', open: false });
const active = computed(() => ['queued', 'checking', 'packaging'].includes(state.job?.phase));
let polling;
let users = 0;
let pending;
let submission;

async function refresh() {
  if (pending) return pending;
  state.loading = true;
  pending = (async () => {
    try {
      const result = await api('/api/environment/migration/status', { signal: AbortSignal.timeout(12_000) });
      state.job = result.job;
      state.prepared = result.prepared;
      state.error = '';
    } catch (error) { state.error = error.message || '准备状态读取失败'; }
    finally { state.loading = false; pending = null; }
  })();
  return pending;
}

async function run(operation) {
  if (state.submitting || active.value) return;
  if (relay.dirty) { state.error = '有未保存的设置，请先保存或取消更改。'; return; }
  // Keep the id after an ambiguous network failure; retrying the same request
  // returns its existing job rather than generating another package.
  if (!submission || submission.operation !== operation) submission = { operation, requestId: crypto.randomUUID() };
  state.submitting = true;
  try {
    state.job = await api(`/api/environment/migration/${operation}`, { method: 'POST', body: JSON.stringify({ requestId: submission.requestId }), signal: AbortSignal.timeout(12_000) });
    submission = null;
    state.error = '';
    await refresh();
  } catch (error) { state.error = error.message || '提交失败，请重试'; }
  finally { state.submitting = false; schedule(100); }
}

async function cancel() {
  if (!active.value || state.submitting || state.job.cancelRequested) return;
  state.submitting = true;
  try {
    state.job = await api('/api/environment/migration/cancel', { method: 'POST', body: JSON.stringify({ id: state.job.id }), signal: AbortSignal.timeout(12_000) });
    state.error = '';
  } catch (error) { state.error = error.message; }
  finally { state.submitting = false; }
}

async function tick() {
  if (!users) return;
  if (document.visibilityState === 'visible') await refresh();
  schedule(active.value || state.open ? 1500 : 15_000);
}
function schedule(delay) { clearTimeout(polling); if (users) polling = setTimeout(tick, delay); }
function start() { if (++users === 1) void tick(); }
function stop() { users = Math.max(0, users - 1); if (!users) clearTimeout(polling); }
function open() { state.open = true; schedule(0); }
export function useMigration() { return { state, active, refresh, run, cancel, start, stop, open }; }
