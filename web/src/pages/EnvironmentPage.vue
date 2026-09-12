<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import { CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined, ReloadOutlined, ToolOutlined } from '@ant-design/icons-vue';
import { useEnvironment } from '../stores/environment.js';
import { useRelay } from '../stores/relay.js';
import { describeEnvironmentError } from '../lib/environment.js';

const { state, stale, refresh, repair, start, stop } = useEnvironment();
const { state: relay, api } = useRelay();
const maintenanceBusy = ref('');
const data = computed(() => state.data);
const cards = computed(() => {
  if (!data.value) return [];
  const d = data.value;
  return [
    { title: 'Relay 网络', state: d.relay.state === 'connected' ? 'ok' : 'warning', value: ({ connected: '已连接', reconnecting: '正在重连', disconnected: '未连接', error: '连接异常' })[d.relay.state] || '连接中', help: `最近心跳 ${formatTime(d.relay.lastHeartbeat)}` },
    { title: 'Codex App Server', state: d.backend.state === 'ready' ? 'ok' : 'warning', value: ({ ready: '已就绪', error: '启动异常', stopped: '未启动', starting: '启动中', reconnecting: '正在重连' })[d.backend.state] || '未检查', help: '由插件在本机托管，任务数据由 Codex Server 提供' },
    { title: '桌面工具', state: d.desktopTools.state === 'passed' ? 'ok' : d.desktopTools.state === 'blocked' ? 'warning' : 'unknown', value: d.desktopTools.label, help: d.desktopTools.message },
  ];
});
const icon = value => value === 'ok' ? CheckCircleOutlined : value === 'warning' ? ExclamationCircleOutlined : ClockCircleOutlined;

function formatTime(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date) : '尚无记录';
}

async function maintenanceAction(action) {
  if (maintenanceBusy.value) return;
  maintenanceBusy.value = action;
  const labels = { backend: 'Codex App Server', relay: 'Relay 连接' };
  try {
    await api(action === 'backend' ? '/api/app-server/restart' : '/api/connection/reconnect', { method: 'POST' });
    await refresh(true);
    message.success(`${labels[action]}已重新建立`);
  } catch (error) {
    message.error(error.message || `${labels[action]}重连失败`);
    await refresh(true);
  } finally { maintenanceBusy.value = ''; }
}

onMounted(start);
onBeforeUnmount(stop);
</script>

<template>
  <section class="route-page environment-page">
    <div class="section-title environment-heading">
      <div><div class="eyebrow">运行与恢复</div><h1>运行环境</h1><p>检查 Relay、Codex App Server 和本机工具状态。</p></div>
      <a-button type="primary" :loading="state.loading" :disabled="state.repairing" @click="refresh(true)"><ReloadOutlined aria-hidden="true" />检查环境</a-button>
    </div>

    <div class="environment-freshness" aria-live="polite">
      <span v-if="state.error" class="environment-error">检查失败：{{ state.error }}。{{ data ? '以下为上次结果。' : '请重试。' }}</span>
      <span v-else-if="!data">正在读取运行环境…</span>
      <span v-else>{{ stale ? '检查结果已过期，请重新检查' : '最近检查' }} · {{ formatTime(data.checkedAt) }}</span>
      <span>检查不会停止进程或接管任务</span>
    </div>

    <template v-if="data">
      <div class="environment-status-grid" :class="{ 'environment-stale': stale }">
        <article v-for="card in cards" :key="card.title" class="environment-status-card">
          <div><span>{{ card.title }}</span><component :is="icon(stale ? 'unknown' : card.state)" :class="stale ? 'unknown' : card.state" /></div>
          <strong>{{ stale ? '待重新检查' : card.value }}</strong><p>{{ card.help }}</p>
        </article>
      </div>

      <div v-if="data.backend.error" class="environment-notice environment-notice-error" role="alert">
        <ExclamationCircleOutlined /><div><strong>{{ stale ? '上次检查的后端异常' : '执行后端异常' }}</strong><p>{{ describeEnvironmentError(data.backend.error) }}</p><details><summary>原始错误</summary><code>{{ data.backend.error }}</code></details></div>
      </div>

      <section class="environment-panel" aria-labelledby="environment-installation">
        <div class="environment-panel-heading"><div><h2 id="environment-installation">安装与执行路径</h2><p>进程使用的版本和路径，与磁盘中的安装信息分开显示。</p></div><a-tag v-if="data.plugin.needsRestart" color="warning">需要重启插件</a-tag></div>
        <dl class="environment-facts">
          <div><dt>插件运行版本</dt><dd>{{ data.plugin.runningVersion }}</dd></div>
          <div><dt>插件安装版本</dt><dd>{{ data.plugin.installedVersion || '未检测到' }}</dd></div>
          <div><dt>桌面版本</dt><dd>{{ data.desktop.version || (data.desktop.running === false ? '桌面未运行' : '未检测到') }}</dd></div>
          <div><dt>Codex CLI</dt><dd>{{ data.executable.version || '当前命令不可用' }}</dd></div>
        </dl>
        <div class="environment-path"><span>当前执行命令</span><code>{{ data.executable.configured }}</code></div>
        <div v-if="data.executable.candidate && data.executable.needsRepair" class="environment-path"><span>已验证的候选路径</span><code>{{ data.executable.candidate.path }}</code></div>
        <div class="environment-panel-actions">
          <div><strong>{{ data.executable.message }}</strong><p>{{ data.actions.repair.reason }}</p><p v-if="relay.dirty">有未保存的设置，请先保存或取消更改。</p></div>
          <a-button :loading="state.repairing" :disabled="stale || state.loading || relay.dirty || !data.actions.repair.enabled" @click="repair"><ToolOutlined aria-hidden="true" />修复执行路径</a-button>
        </div>
        <details class="environment-details"><summary>进程与目录详情</summary><dl>
          <div><dt>插件进程</dt><dd>PID {{ data.plugin.pid }} · 启动于 {{ formatTime(data.plugin.startedAt) }}</dd></div>
          <div><dt>Codex App Server 进程</dt><dd>{{ data.backend.pid ? 'PID ' + data.backend.pid : '未运行' }}</dd></div>
          <div><dt>桌面后端接入</dt><dd>{{ data.desktopBackend.state === 'detected' ? `PID ${data.desktopBackend.pid} · ${data.desktopBackend.transport}` : '未检测到' }}</dd></div>
          <div v-if="data.desktopBackend.reason"><dt>桌面后端说明</dt><dd>{{ data.desktopBackend.reason }}</dd></div>
          <div><dt>插件目录</dt><dd><code>{{ data.plugin.root }}</code></dd></div>
          <div><dt>配置目录</dt><dd><code>{{ data.paths.configDir }}</code></dd></div>
          <div><dt>Codex 数据目录</dt><dd><code>{{ data.paths.codexHome }}</code></dd></div>
        </dl></details>
      </section>

      <section class="environment-panel environment-maintenance" aria-labelledby="environment-maintenance">
        <div class="environment-panel-heading"><div><h2 id="environment-maintenance">运行维护</h2><p>分别重连本机执行后端或外网 Relay 通道。</p></div><a-tag color="blue">可视化操作</a-tag></div>
        <div class="environment-maintenance-grid">
          <div><strong>重连 Codex App Server</strong><p>重新建立插件与本机 Codex Server 的连接。</p><a-button :loading="maintenanceBusy === 'backend'" :disabled="Boolean(maintenanceBusy)" @click="maintenanceAction('backend')">重新连接后端</a-button></div>
          <div><strong>重连 Relay</strong><p>重新建立手机、桌面端与外网 Relay 的桥接通道。</p><a-button :loading="maintenanceBusy === 'relay'" :disabled="Boolean(maintenanceBusy)" @click="maintenanceAction('relay')">重新连接 Relay</a-button></div>
        </div>
      </section>
    </template>
    <div v-else-if="state.error" class="environment-empty"><ExclamationCircleOutlined /><strong>暂时无法检查环境</strong><p>确认插件服务正在运行，再点击上方“检查环境”。</p></div>
  </section>
</template>
