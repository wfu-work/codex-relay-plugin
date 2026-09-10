import { computed, nextTick, reactive, ref } from 'vue';
import { message } from 'ant-design-vue';
import { useRelay } from './relay.js';
import { environmentIsStale } from '../lib/environment.js';

const state = reactive({ data: null, loading: false, repairing: false, error: '' });
const now = ref(Date.now());
let pending;
let users = 0;
let timer;
const stale = computed(() => environmentIsStale(state.data, now.value, Boolean(state.error)));
const { api, state: relay, refreshStatus } = useRelay();

async function refresh(force = false) {
  if (pending) return pending;
  state.loading = true;
  pending = (async () => {
    try {
      state.data = await api(force ? '/api/environment/check' : '/api/environment', { ...(force ? { method: 'POST' } : {}), signal: AbortSignal.timeout(20_000) });
      state.error = '';
    } catch (error) { state.error = error.message || '环境检查失败'; }
    finally { state.loading = false; now.value = Date.now(); pending = null; }
  })();
  return pending;
}

async function repair() {
  if (state.repairing || state.loading || stale.value || !state.data?.actions.repair.enabled) return;
  if (relay.dirty) { message.info('有未保存的设置，请先保存或取消更改后再修复。'); return; }
  state.repairing = true;
  try {
    const result = await api('/api/environment/repair-executable', { method: 'POST', body: JSON.stringify({ configured: state.data.executable.configured, candidate: state.data.actions.repair.candidate }) });
    state.data = result.environment;
    state.error = '';
    // Only synchronize the repaired field; keep unrelated edits and credential baselines.
    if (relay.form.codexExecutable === state.data.executable.configured || !relay.dirty) {
      relay.applyingConfig = true;
      relay.form.codexExecutable = result.executable;
      await nextTick();
      relay.applyingConfig = false;
    }
    now.value = Date.now();
    await refreshStatus(true);
    result.connectionError ? message.warning(result.connectionError) : message.success('执行路径已修复');
  } catch (error) { message.error(error.message); await refresh(true); }
  finally { state.repairing = false; }
}

function start() {
  if (++users !== 1) return;
  void refresh();
  timer = setInterval(() => { now.value = Date.now(); if (document.visibilityState === 'visible' && !state.repairing) void refresh(); }, 15_000);
}
function stop() { users = Math.max(0, users - 1); if (!users) clearInterval(timer); }

export function useEnvironment() { return { state, stale, refresh, repair, start, stop }; }
