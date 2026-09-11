<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { message } from 'ant-design-vue';
import { CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined, ReloadOutlined, ToolOutlined } from '@ant-design/icons-vue';
import { useEnvironment } from '../stores/environment.js';
import { useRelay } from '../stores/relay.js';
import { useMigration } from '../stores/migration.js';
import { describeEnvironmentError, migrationPhaseLabels } from '../lib/environment.js';
import MigrationPreparationPanel from '../components/MigrationPreparationPanel.vue';

const { state, stale, refresh, repair, start, stop } = useEnvironment();
const { state: relay, api } = useRelay();
const maintenanceBusy = ref('');
const { state: migrationState, open: openMigration, runAndWait } = useMigration();
const data = computed(() => state.data);
const quickFixBusy = ref(false);
const quickFixLabel = computed(() => data.value?.backend.mode === 'shared' ? '一键修复共享后端' : '一键准备共享后端');
const quickFixDescription = computed(() => data.value?.backend.mode === 'shared'
  ? '自动重连共享服务与 Relay；如果桌面工具需要修复，会引导你退出桌面后自动完成。'
  : '自动修复可用的执行路径、检查条件并生成准备包，整个过程都在控制台完成。');
const cards = computed(() => {
  if (!data.value) return [];
  const d = data.value;
  return [
    { title: 'Relay 网络', state: d.relay.state === 'connected' ? 'ok' : 'warning', value: ({ connected: '已连接', reconnecting: '正在重连', disconnected: '未连接', error: '连接异常' })[d.relay.state] || '连接中', help: `最近心跳 ${formatTime(d.relay.lastHeartbeat)}` },
    { title: '执行后端', state: d.backend.state === 'ready' ? 'ok' : 'warning', value: ({ ready: '已就绪', error: '启动异常', stopped: '未启动', starting: '启动中', reconnecting: '正在重连' })[d.backend.state] || '未检查', help: d.backend.mode === 'shared' ? '插件连接共享服务' : '插件使用独立进程' },
    { title: '执行模式', state: d.backend.mode === 'shared' && d.backend.state === 'ready' ? 'ok' : 'unknown', value: d.backend.mode === 'shared' ? '共享后端' : '独立后端', help: d.backend.mode === 'shared' ? '桌面工具可用性单独检查' : '桌面任务可能存在写入占用' },
    { title: '桌面工具', state: d.desktopTools.state === 'passed' ? 'ok' : d.desktopTools.state === 'blocked' ? 'warning' : 'unknown', value: d.desktopTools.label, help: d.desktopTools.message },
  ];
});
const sameProcesses = computed(() => data.value?.processes.items.filter(p => p.scope !== 'other') || []);
const last = computed(() => data.value?.migration.last);
const icon = state => state === 'ok' ? CheckCircleOutlined : state === 'warning' ? ExclamationCircleOutlined : ClockCircleOutlined;
const phase = value => migrationPhaseLabels[value] || value || '未记录';
function formatTime(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date) : '尚无记录';
}
async function maintenanceAction(action) {
  if (maintenanceBusy.value) return;
  maintenanceBusy.value = action;
  const labels = { backend: '共享后端连接', relay: 'Relay 连接' };
  try {
    await api(action === 'backend' ? '/api/app-server/restart' : '/api/connection/reconnect', { method: 'POST' });
    await refresh(true);
    message.success(`${labels[action]}已重新建立`);
  } catch (error) {
    message.error(error.message || `${labels[action]}重连失败`);
    await refresh(true);
  } finally { maintenanceBusy.value = ''; }
}
async function quickFix() {
  if (quickFixBusy.value || state.loading || stale.value || !data.value || relay.dirty) {
    if (relay.dirty) message.info('有未保存的设置，请先保存或取消更改。');
    return;
  }
  quickFixBusy.value = true;
  try {
    openMigration();
    if (data.value.backend.mode === 'shared') {
      if (data.value.desktopTools.code === 'shared_runtime_restart_required') {
        await runAndWait('repair-runtime');
      } else {
        if (data.value.backend.state !== 'ready') await maintenanceAction('backend');
        if (data.value.relay.state !== 'connected') await maintenanceAction('relay');
        await runAndWait('verify-desktop');
      }
      await refresh(true);
      if (state.data?.desktopTools.state === 'passed' && state.data?.backend.state === 'ready') message.success('共享后端已恢复，桌面工具检查通过');
      else message.warning('共享后端已处理，请查看向导中的检查结果');
    } else {
      if (data.value.actions.repair.enabled) await repair();
      await refresh(true);
      await runAndWait('check');
      if (migrationState.job?.report?.readyToPrepare) {
        await runAndWait('prepare');
        message.success('共享后端准备包已生成，可在向导中继续启用');
      } else {
        message.warning('已完成自动检查，但仍有待处理项，请按向导提示操作');
      }
    }
  } catch (error) {
    message.error(error.message || '自动处理失败，请查看向导中的详细状态');
    await refresh(true);
  } finally { quickFixBusy.value = false; }
}
onMounted(start);
onBeforeUnmount(stop);
</script>

<template>
  <section class="route-page environment-page">
    <div class="section-title environment-heading">
      <div><div class="eyebrow">运行与恢复</div><h1>运行环境</h1><p>查看连接停在哪一步，检查本机环境与迁移结果。</p></div>
      <a-button type="primary" :loading="state.loading" :disabled="state.repairing || quickFixBusy" @click="refresh(true)"><ReloadOutlined aria-hidden="true" />检查环境</a-button>
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
          <a-button :loading="state.repairing" :disabled="stale || state.loading || relay.dirty || quickFixBusy || !data.actions.repair.enabled" @click="repair"><ToolOutlined aria-hidden="true" />修复执行路径</a-button>
        </div>
        <details class="environment-details"><summary>进程与目录详情</summary><dl>
          <div><dt>插件进程</dt><dd>PID {{ data.plugin.pid }} · 启动于 {{ formatTime(data.plugin.startedAt) }}</dd></div>
          <div><dt>插件持有的后端进程</dt><dd>{{ data.backend.pid ? 'PID ' + data.backend.pid : data.backend.mode === 'shared' ? '由共享服务管理' : '无' }}</dd></div>
          <div v-if="data.backend.endpoint"><dt>共享端点</dt><dd><code>{{ data.backend.endpoint }}</code></dd></div>
          <div><dt>桌面后端接入</dt><dd>{{ data.desktopBackend.state === 'detected' ? `PID ${data.desktopBackend.pid} · ${data.desktopBackend.transport}` : '未检测到' }}</dd></div>
          <div v-if="data.desktopBackend.reason"><dt>桌面后端说明</dt><dd>{{ data.desktopBackend.reason }}</dd></div>
          <div><dt>插件目录</dt><dd><code>{{ data.plugin.root }}</code></dd></div>
          <div><dt>配置目录</dt><dd><code>{{ data.paths.configDir }}</code></dd></div>
          <div><dt>Codex 数据目录</dt><dd><code>{{ data.paths.codexHome }}</code></dd></div>
        </dl></details>
      </section>

      <section class="environment-panel environment-maintenance" aria-labelledby="environment-maintenance">
        <div class="environment-panel-heading"><div><h2 id="environment-maintenance">运行维护</h2><p>常用恢复操作集中在这里完成。共享模式下只重连插件连接，不会停止桌面共享后端或删除历史数据。</p></div><a-tag color="blue">可视化操作</a-tag></div>
        <div class="environment-quick-fix">
          <div><strong>{{ quickFixLabel }}</strong><p>{{ quickFixDescription }}</p></div>
          <a-button type="primary" :loading="quickFixBusy" :disabled="quickFixBusy || state.loading || stale || relay.dirty" @click="quickFix"><ToolOutlined aria-hidden="true" />{{ quickFixLabel }}</a-button>
        </div>
        <div class="environment-maintenance-grid">
          <div><strong>重连共享后端</strong><p>修复插件与共享 App Server 的连接或订阅状态。</p><a-button :loading="maintenanceBusy === 'backend'" :disabled="Boolean(maintenanceBusy) || quickFixBusy" @click="maintenanceAction('backend')">重新连接后端</a-button></div>
          <div><strong>重连 Relay</strong><p>重新建立 Flutter 与本机之间的 Relay 通道。</p><a-button :loading="maintenanceBusy === 'relay'" :disabled="Boolean(maintenanceBusy) || quickFixBusy" @click="maintenanceAction('relay')">重新连接 Relay</a-button></div>
          <div><strong>安装与检查</strong><p>{{ data.backend.mode === 'shared' ? '查看已启用的共享安装，检查当前桌面工具。' : '检查迁移条件并生成准备包。' }}</p><a-button @click="openMigration">{{ data.backend.mode === 'shared' ? '查看共享安装' : '打开迁移向导' }}</a-button></div>
        </div>
      </section>

      <section class="environment-panel" aria-labelledby="environment-migration">
        <MigrationPreparationPanel :blockers="data.actions.migrate.blockers" :connection-mode="data.backend.mode" :backend-state="data.backend.state" />
        <div class="environment-history-heading"><h3>当前安装记录</h3><span>{{ data.migration.label }}</span></div>
        <template v-if="last">
          <dl class="environment-history">
            <div><dt>结果</dt><dd>{{ phase(last.phase) }} · {{ formatTime(last.updatedAt) }}</dd></div>
            <div v-if="last.failedPhase"><dt>失败阶段</dt><dd>{{ phase(last.failedPhase) }}</dd></div>
            <div v-if="last.error"><dt>原因</dt><dd>{{ describeEnvironmentError(last.error) }}</dd></div>
            <div v-if="last.recovery"><dt>恢复记录</dt><dd>{{ last.recovery }}</dd></div>
          </dl>
          <details v-if="last.backup" class="environment-details"><summary>备份与历史验证</summary><p class="field-help">以下只代表上次迁移的结果，不能证明当前连接正常。</p><p>任务双连接验证：{{ last.checks.concurrentResume ? '上次通过' : '未记录通过结果' }} · 桌面工具：{{ last.checks.desktopTools ? '上次通过' : '未记录通过结果' }}</p><code>{{ last.backup }}</code></details>
        </template>
        <p v-else class="field-help">{{ data.migration.state === 'unreadable' ? '记录读取失败，请检查启动包目录。' : data.migration.state === 'different_environment' ? '启动包与当前配置目录不一致，未加载其他环境的迁移记录。' : data.migration.state === 'active' ? '共享后端已有启用记录，工具检查结果独立显示。' : '当前环境还没有迁移执行记录。' }}</p>
      </section>
    </template>
    <div v-else-if="state.error" class="environment-empty"><ExclamationCircleOutlined /><strong>暂时无法检查环境</strong><p>确认插件服务正在运行，再点击上方“检查环境”。</p></div>
  </section>
</template>
