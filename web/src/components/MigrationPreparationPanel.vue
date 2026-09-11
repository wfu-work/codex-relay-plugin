<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { Modal, message } from 'ant-design-vue';
import { CheckCircleOutlined, ClockCircleOutlined, CopyOutlined, ExclamationCircleOutlined } from '@ant-design/icons-vue';
import { useMigration } from '../stores/migration.js';
import { useRelay } from '../stores/relay.js';

const props = defineProps({ blockers: { type: Array, default: () => [] }, connectionMode: { type: String, default: 'managed' }, backendState: { type: String, default: 'unknown' } });
const { state, active, refresh, run, cancel, start, stop, open } = useMigration();
const { state: relay } = useRelay();
const shared = computed(() => props.connectionMode === 'shared');
const labels = { queued: '等待检查', checking: '正在检查', packaging: '正在生成准备包', restarting: '正在重启与验证', complete: '检查完成', blocked: '有待处理项', cancelled: '已取消', failed: '检查失败', interrupted: '检查进程已退出' };
const checkLabels = { passed: '通过', warning: '待处理', blocked: '未通过', unchecked: '未检查', stale: '已过期' };
const historical = computed(() => Boolean(shared.value && state.job?.historical));
const groups = computed(() => [
  { title: '准备条件', checks: state.job?.report?.checks?.filter(c => c.scope === 'prepare') || [] },
  { title: '切换前检查', checks: state.job?.report?.checks?.filter(c => c.scope === 'activation') || [] },
  { title: shared.value ? '当前共享后端 · 桌面工具检查' : '桌面工具检查', checks: state.job?.report?.checks?.filter(c => c.scope === 'diagnostic') || [] },
]);
const canPrepare = computed(() => !shared.value && !active.value && !state.error && !relay.dirty && state.job?.report?.readyToPrepare && state.job.phase === 'complete');
const icon = check => check.state === 'passed' ? CheckCircleOutlined : check.state === 'blocked' ? ExclamationCircleOutlined : ClockCircleOutlined;
const time = value => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '';
async function copyPath() {
  try { await navigator.clipboard.writeText(state.prepared.root); message.success('安装目录已复制'); }
  catch { message.warning('复制失败，请手动选择路径复制'); }
}
onMounted(start);
onBeforeUnmount(stop);
</script>

<template>
  <div class="environment-panel-heading">
    <div><h2 id="environment-migration">{{ shared ? '共享后端管理' : '共享后端迁移' }}</h2><p>{{ shared ? '查看当前安装，检查浏览器等桌面工具的连接。' : '检查迁移条件并生成准备包。' }}</p></div>
    <a-button type="primary" @click="open">{{ shared ? '检查与管理' : '迁移向导' }}</a-button>
  </div>
  <div v-if="shared" class="environment-notice"><CheckCircleOutlined v-if="backendState === 'ready'" aria-hidden="true" /><ClockCircleOutlined v-else aria-hidden="true" /><div><strong>{{ backendState === 'ready' ? '共享后端已连接' : '共享模式已配置，后端待连接' }}</strong><p>当前使用共享服务，无需重复迁移。桌面工具检查不代表消息执行链路的状态。</p></div></div>
  <div v-else-if="blockers.length" class="environment-notice"><ClockCircleOutlined aria-hidden="true" /><div><strong>切换前待处理</strong><ul><li v-for="reason in blockers" :key="reason">{{ reason }}</li></ul></div></div>
  <div v-if="state.job && !historical" class="migration-job-summary" aria-live="polite">
    <div><strong>{{ state.job.stale ? '检查结果已过期' : labels[state.job.phase] || '状态待确认' }}</strong><p>{{ state.job.step }} · {{ time(state.job.updatedAt) }}</p></div>
    <a-button @click="open">{{ active ? '查看进度' : '查看检查结果' }}</a-button>
  </div>
  <p v-if="state.error && !state.open" class="environment-error" role="alert">状态读取失败：{{ state.error }}</p>

  <Modal v-model:open="state.open" :title="shared ? '共享后端检查与管理' : '共享后端迁移向导'" wrap-class-name="migration-modal" :footer="null" :width="780" :destroy-on-close="false">
    <div class="migration-wizard">
      <p class="field-help">{{ shared ? '当前已配置共享模式。插件更新不会把正在使用的安装变回待迁移准备包。' : '准备包包含启动与恢复工具。可先检查环境，再生成准备包。' }}</p>
      <ol v-if="!shared" class="migration-steps" aria-label="迁移步骤">
        <li :class="{ done: state.job?.report?.readyToPrepare }"><span>1</span>检查条件</li>
        <li :class="{ done: state.prepared?.state === 'prepared' }"><span>2</span>生成准备包</li>
        <li><span>3</span>切换与验证</li>
      </ol>
      <div class="migration-toolbar">
        <a-button v-if="!shared" :loading="state.submitting && !active" :disabled="active || state.submitting || relay.dirty" @click="run('check')">检查迁移条件</a-button>
        <a-button :loading="active && state.job?.operation === 'verify-desktop'" :disabled="active || state.submitting || relay.dirty" @click="run('verify-desktop')">{{ shared ? '检查当前桌面工具' : '验证桌面兼容性' }}</a-button>
        <a-button v-if="!shared" type="primary" :disabled="!canPrepare || state.submitting" @click="run('prepare')">生成准备包</a-button>
        <a-button v-if="active" :disabled="state.submitting || state.job.cancelRequested || state.job.phase === 'restarting'" @click="cancel">{{ state.job.cancelRequested ? '等待取消…' : '取消检查' }}</a-button>
        <a-button :loading="state.loading" @click="refresh">刷新进度</a-button>
      </div>
      <p class="field-help">{{ shared ? '检查读取当前共享后端中已加载任务的工具目录；不新建任务、不发送模型问题、不重启后端。' : '检查使用临时隔离后端读取工具目录，不发送模型问题。' }} 签名与工具目录分别报告；结果在桌面或后端重启、安装变化或 10 分钟后失效。</p>
      <div v-if="shared && state.job?.report?.code === 'shared_runtime_restart_required' && !active" class="environment-notice">
        <ExclamationCircleOutlined aria-hidden="true" />
        <div><strong>修复共享服务运行时</strong><p>点击后等待你退出 Codex 桌面；所有任务结束后自动重启共享服务、重新打开桌面并检查工具。最多等待 15 分钟，可取消。历史、API 配置和共享安装继续保留；等待期间请勿从 Flutter 发起新任务。</p><a-button type="primary" :disabled="state.submitting || relay.dirty || state.job.stale" @click="run('repair-runtime')">退出桌面后自动修复</a-button></div>
      </div>
      <p v-if="relay.dirty" class="environment-error">有未保存的设置，请先保存或取消更改。</p>
      <div v-if="state.error" class="environment-notice environment-notice-error" role="alert"><ExclamationCircleOutlined aria-hidden="true" /><div><strong>暂时无法确认最新进度</strong><p>{{ state.error }}。下方为上次结果。</p></div></div>
      <div v-if="!historical" class="migration-progress" aria-live="polite">
        <strong>{{ state.job ? state.error || state.job.stale ? '需要重新检查' : labels[state.job.phase] : '尚未运行检查' }}</strong>
        <p>{{ state.job?.stale ? '下方为上次检查记录，请重新检查当前桌面工具。' : state.job?.error || state.job?.step || '点击上方检查按钮开始。' }}</p>
        <p v-if="active">{{ state.job.cancelRequested ? '正在取消检查…' : '可关闭页面；重新打开后会恢复本次进度。' }}</p>
      </div>
      <details v-if="historical" class="environment-details">
        <summary>旧迁移检查记录 · {{ time(state.job.updatedAt) }}</summary>
        <p>{{ state.job.step }}。该记录来自之前的检查流程，请重新检查当前桌面工具。</p>
        <ul><li v-for="check in state.job.report?.checks || []" :key="check.id">{{ check.title }}：{{ check.detail }}</li></ul>
      </details>
      <template v-else>
        <section v-for="group in groups.filter(g => g.checks.length)" :key="group.title" class="migration-check-group" :class="{ 'environment-stale': state.error || state.job?.stale }">
          <h3>{{ group.title }}</h3>
          <ul class="migration-checks">
            <li v-for="check in group.checks" :key="check.id"><component :is="state.job.stale ? ClockCircleOutlined : icon(check)" :class="state.job.stale ? 'stale' : check.state" aria-hidden="true" /><div><strong>{{ check.title }}</strong><p>{{ check.detail }}</p></div><span class="migration-check-result">{{ state.job.stale ? '已过期' : checkLabels[check.state] || '待确认' }}</span></li>
          </ul>
        </section>
      </template>
      <div v-if="state.prepared" class="migration-artifact">
        <strong>{{ state.prepared.state === 'active' ? '当前共享安装 · 已启用' : state.prepared.state === 'configured' ? '当前共享安装 · 已配置，启用记录待确认' : state.prepared.state === 'prepared' ? '准备包已生成 · 尚未切换' : state.prepared.state === 'stale' ? '准备包与当前配置或版本不同，切换前请重新生成' : '准备包已被移走或删除，请重新生成' }}</strong>
        <code>{{ state.prepared.root }}</code>
        <div><span class="field-help">{{ time(state.prepared.activatedAt || state.prepared.createdAt) }}</span><a-button size="small" @click="copyPath"><CopyOutlined aria-hidden="true" />复制路径</a-button></div>
      </div>
      <div v-if="!shared" class="migration-final-action"><p>当前控制台支持检查与准备；正式切换仍需使用准备包的启动与恢复工具。</p><a-button disabled>切换共享后端</a-button></div>
    </div>
  </Modal>
</template>
