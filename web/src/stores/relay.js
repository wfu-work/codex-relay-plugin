import { computed, nextTick, reactive, watch } from 'vue';
import { message } from 'ant-design-vue';
import { theme as antdTheme } from 'ant-design-vue';
import { getDashboardAccessKey } from '../lib/access-key.js';

const permissionNames = ['readThreads', 'sendMessages', 'createThreads', 'steerTurns', 'interruptTurns', 'respondToApprovals'];

const uiFontStack = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Helvetica Neue', 'Microsoft YaHei', sans-serif";

export const relayState = reactive({
  themeMode: localStorage.getItem('codex-relay-theme') === 'light' ? 'light' : 'dark',
  loading: { save: false, connect: false, disconnect: false, test: false, diagnostics: false },
  initialized: false,
  applyingConfig: false,
  dirty: false,
  logs: [],
  diagnostics: null,
  status: null,
  form: {
    relayUrl: '',
    spaceId: '',
    endpointId: '',
    deviceName: '',
    token: '',
    endpointGrant: '',
    grantExpiresAt: null,
    tokenEndpoint: '',
    endpointPublicKey: '',
    autoConnect: false,
    heartbeatSeconds: 20,
    reconnectMaxSeconds: 30,
    codexExecutable: 'codex',
    defaultWorkingDirectory: '',
    autoStartAppServer: true,
    readOnly: false,
    permissions: Object.fromEntries(permissionNames.map((name) => [name, false])),
    allowedProjects: '',
  },
});

export const themeConfig = computed(() => ({
  algorithm: relayState.themeMode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
  token: relayState.themeMode === 'dark'
    ? {
        colorPrimary: '#59c19a', colorInfo: '#59c19a', colorSuccess: '#67c995', colorWarning: '#ddb15a', colorError: '#ee857c',
        colorBgBase: '#171817', colorBgContainer: '#242524', colorBgElevated: '#2a2b2a', colorBorder: '#444544',
        colorBorderSecondary: '#343534', colorText: '#f0efeb', colorTextSecondary: '#b2b1ad', borderRadius: 8,
        fontFamily: uiFontStack, fontSize: 14, fontSizeSM: 12, fontSizeLG: 16, fontWeightStrong: 600, lineHeight: 1.55,
      }
    : {
        colorPrimary: '#16835f', colorInfo: '#16835f', colorSuccess: '#18835e', colorWarning: '#a86d12', colorError: '#c34b42',
        colorBgBase: '#f5f5f3', colorBgContainer: '#ffffff', colorBgElevated: '#ffffff', colorBorder: '#cdceca',
        colorBorderSecondary: '#dededb', colorText: '#252522', colorTextSecondary: '#686864', borderRadius: 8,
        fontFamily: uiFontStack, fontSize: 14, fontSizeSM: 12, fontSizeLG: 16, fontWeightStrong: 600, lineHeight: 1.5,
      },
  components: {
    Card: { paddingLG: 24 },
    Button: { controlHeight: 38, contentFontSize: 14 },
    Input: { controlHeight: 40 },
    Select: { controlHeight: 40 },
  },
}));

export const relayLabel = computed(() => ({
  connected: '已连接',
  connecting: '正在连接',
  authenticating: '正在认证',
  reconnecting: '等待重连',
  disconnected: '未连接',
  error: '连接异常',
}[relayStateValue.value] || relayStateValue.value));

export const relayStateValue = computed(() => relayState.status?.relay?.state || 'disconnected');
export const relayStatusType = computed(() => ({
  connected: 'success',
  connecting: 'processing',
  authenticating: 'processing',
  reconnecting: 'warning',
  error: 'error',
}[relayStateValue.value] || 'default'));
export const appServerLabel = computed(() => relayState.status?.appServer?.state || '—');
export const securityLabel = computed(() => {
  if (relayState.status?.security?.readOnly ?? relayState.form.readOnly) return '只读模式';
  if (relayState.status?.security?.remoteApprovalEnabled ?? relayState.form.permissions.respondToApprovals) return '远程审批已启用';
  return '受限控制';
});
export const securityType = computed(() => securityLabel.value === '远程审批已启用' ? 'warning' : 'success');
export const configReady = computed(() => Boolean(
  relayState.form.relayUrl.trim()
  && relayState.form.spaceId.trim()
  && relayState.form.endpointId.trim()
  && relayState.status?.security?.tokenConfigured,
));

function describeRelayError(errorOrMessage) {
  const code = typeof errorOrMessage === 'object' ? errorOrMessage?.code : '';
  const messageText = typeof errorOrMessage === 'object' ? errorOrMessage?.message : errorOrMessage;
  const message = String(messageText || '').trim();
  const normalized = message.toLowerCase();
  if (code === 'auth.invalid_token' || normalized.includes('invalid connect token') || normalized.includes('无效 connect token')) {
    return '连接令牌无效或已失效。请确认空间 ID 和接入端 ID 与签发时一致，再回到 Relay 控制台重新签发。';
  }
  if (code === 'auth.token_expired' || normalized.includes('token expired') || normalized.includes('令牌已过期')) {
    return '连接令牌已过期。请从 Relay 控制台重新复制最新令牌；如果已配置自动续期，请同时填写接入端授权凭证。';
  }
  if (code === 'auth.proof_mismatch' || normalized.includes('proof mismatch')) {
    return '连接令牌绑定了另一台设备。请在当前设备重新签发令牌，不要沿用旧设备的令牌。';
  }
  if (code === 'RELAY_UNAVAILABLE' || normalized.includes('websocket 连接失败') || normalized.includes('无法连接 relay')) {
    return '暂时连不到 Relay。请检查 Relay 地址、网络和服务是否已启动，再重新测试连接。';
  }
  if (code === 'CONFIG_INCOMPLETE' || normalized.includes('尚未配置')) {
    return '还缺少连接信息。请填写 Relay 地址、空间 ID、接入端 ID 和连接令牌。';
  }
  return message || '连接失败，请运行诊断查看具体原因。';
}

export const relayErrorHint = computed(() => describeRelayError(relayState.status?.relay?.lastError));

function setTheme(value) {
  relayState.themeMode = value;
  localStorage.setItem('codex-relay-theme', value);
  document.documentElement.dataset.theme = value;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = value === 'dark' ? '#181918' : '#f7f7f5';
}

async function api(path, options = {}) {
  const accessKey = getDashboardAccessKey();
  if (!accessKey) throw new Error('控制台访问密钥缺失。请从 Codex 中重新打开 Relay 控制台。');
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + accessKey,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error?.message || '请求失败 (' + response.status + ')');
    error.code = body.error?.code;
    throw error;
  }
  return body;
}

function applyConfig(config) {
  relayState.applyingConfig = true;
  relayState.form.relayUrl = config.relay?.url || '';
  relayState.form.spaceId = config.relay?.spaceId || '';
  relayState.form.endpointId = config.relay?.endpointId || '';
  relayState.form.deviceName = config.relay?.deviceName || '';
  relayState.form.token = config.relay?.token || '';
  relayState.form.endpointGrant = config.relay?.endpointGrant || '';
  relayState.form.grantExpiresAt = config.relay?.grantExpiresAt || null;
  relayState.form.tokenEndpoint = config.relay?.tokenEndpoint || '';
  relayState.form.endpointPublicKey = config.relay?.endpointPublicKey || '';
  relayState.form.autoConnect = Boolean(config.relay?.autoConnect);
  relayState.form.heartbeatSeconds = config.relay?.heartbeatSeconds ?? 20;
  relayState.form.reconnectMaxSeconds = config.relay?.reconnectMaxSeconds ?? 30;
  relayState.form.codexExecutable = config.codex?.executable || 'codex';
  relayState.form.defaultWorkingDirectory = config.codex?.defaultWorkingDirectory || '';
  relayState.form.autoStartAppServer = Boolean(config.codex?.autoStartAppServer);
  relayState.form.readOnly = Boolean(config.readOnly);
  relayState.form.allowedProjects = (config.allowedProjects || []).join('\n');
  for (const name of permissionNames) relayState.form.permissions[name] = Boolean(config.permissions?.[name]);
  relayState.dirty = false;
  nextTick(() => {
    relayState.applyingConfig = false;
    relayState.dirty = false;
  });
}

function collectConfig() {
  return {
    relay: {
      url: relayState.form.relayUrl.trim(),
      spaceId: relayState.form.spaceId.trim(),
      endpointId: relayState.form.endpointId.trim(),
      deviceName: relayState.form.deviceName.trim(),
      autoConnect: relayState.form.autoConnect,
      heartbeatSeconds: Number(relayState.form.heartbeatSeconds),
      reconnectMaxSeconds: Number(relayState.form.reconnectMaxSeconds),
    },
    codex: {
      executable: relayState.form.codexExecutable.trim() || 'codex',
      defaultWorkingDirectory: relayState.form.defaultWorkingDirectory.trim(),
      autoStartAppServer: relayState.form.autoStartAppServer,
    },
    permissions: { ...relayState.form.permissions },
    readOnly: relayState.form.readOnly,
    allowedProjects: relayState.form.allowedProjects.split('\n').map((line) => line.trim()).filter(Boolean),
  };
}

function shortTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value));
}

async function refreshStatus(silent = false) {
  try {
    relayState.status = await api('/api/status');
  } catch (error) {
    if (!silent) message.error(describeRelayError(error));
  }
}

async function refreshLogs(silent = false) {
  try {
    relayState.logs = (await api('/api/logs?limit=120')).logs || [];
  } catch (error) {
    if (!silent) message.error(describeRelayError(error));
  }
}

async function saveConfig() {
  if (!relayState.form.relayUrl.trim() || !relayState.form.spaceId.trim() || !relayState.form.endpointId.trim()) {
    message.warning('请填写 Relay 地址、空间 ID 和接入端 ID');
    return false;
  }
  relayState.loading.save = true;
  try {
    const updated = await api('/api/config', {
      method: 'PUT',
      body: JSON.stringify({
        config: collectConfig(),
        credential: {
          ...(relayState.form.token ? { connectToken: relayState.form.token.trim() } : {}),
          endpointGrant: relayState.form.endpointGrant.trim(),
          grantExpiresAt: relayState.form.grantExpiresAt ? Number(relayState.form.grantExpiresAt) : null,
          tokenEndpoint: relayState.form.tokenEndpoint.trim(),
        },
      }),
    });
    applyConfig(updated);
    await refreshStatus(true);
    message.success('配置已保存并应用');
    return true;
  } catch (error) {
    message.error(describeRelayError(error));
    return false;
  } finally {
    relayState.loading.save = false;
  }
}

async function runConnection(action, successText) {
  relayState.loading[action] = true;
  try {
    await api('/api/connection/' + action, { method: 'POST' });
    message.success(successText);
    await Promise.all([refreshStatus(true), refreshLogs(true)]);
    return true;
  } catch (error) {
    message.error(describeRelayError(error));
    return false;
  } finally {
    relayState.loading[action] = false;
  }
}

async function runDiagnostics() {
  relayState.loading.diagnostics = true;
  try {
    relayState.diagnostics = await api('/api/diagnostics');
    message.success('诊断完成');
    await refreshLogs(true);
  } catch (error) {
    message.error(describeRelayError(error));
  } finally {
    relayState.loading.diagnostics = false;
  }
}

async function clearLogs() {
  try {
    await api('/api/logs', { method: 'DELETE' });
    relayState.logs = [];
    message.success('日志已清空');
  } catch (error) {
    message.error(describeRelayError(error));
  }
}

let statusTimer;
let logTimer;
let started = false;
let beforeUnloadHandler;

async function start() {
  if (started) return;
  started = true;
  setTheme(relayState.themeMode);
  beforeUnloadHandler = (event) => {
    if (relayState.dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', beforeUnloadHandler);
  try {
    if (!getDashboardAccessKey()) throw new Error('访问密钥缺失，请从 Codex 插件重新打开控制台');
    const [config, nextStatus] = await Promise.all([api('/api/config'), api('/api/status')]);
    applyConfig(config);
    relayState.status = nextStatus;
    await refreshLogs(true);
    relayState.initialized = true;
    statusTimer = setInterval(() => refreshStatus(true), 2500);
    logTimer = setInterval(() => refreshLogs(true), 10000);
  } catch (error) {
    message.error(describeRelayError(error));
  }
}

function stop() {
  clearInterval(statusTimer);
  clearInterval(logTimer);
  if (beforeUnloadHandler) window.removeEventListener('beforeunload', beforeUnloadHandler);
  started = false;
}

watch(() => relayState.form, () => {
  if (relayState.initialized && !relayState.applyingConfig) relayState.dirty = true;
}, { deep: true });
watch(() => relayState.form.readOnly, (value) => {
  if (value) relayState.form.permissions.respondToApprovals = false;
});

export function useRelay() {
  return {
    state: relayState,
    themeConfig,
    relayStateValue,
    relayLabel,
    relayStatusType,
    appServerLabel,
    securityLabel,
    securityType,
    configReady,
    relayErrorHint,
    setTheme,
    api,
    applyConfig,
    collectConfig,
    shortTime,
    refreshStatus,
    refreshLogs,
    saveConfig,
    runConnection,
    runDiagnostics,
    clearLogs,
    start,
    stop,
  };
}
