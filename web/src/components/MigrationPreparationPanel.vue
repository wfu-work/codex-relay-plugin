<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { Modal, message } from 'ant-design-vue';
import { CheckCircleOutlined, ClockCircleOutlined, CopyOutlined, ExclamationCircleOutlined } from '@ant-design/icons-vue';
import { useMigration } from '../stores/migration.js';
import { useRelay } from '../stores/relay.js';

defineProps({ blockers: { type: Array, default: () => [] } });
const { state, active, refresh, run, cancel, start, stop, open } = useMigration();
const { state: relay } = useRelay();
const labels = { queued: '等待检查', checking: '正在检查', packaging: '正在生成准备包', complete: '已完成', blocked: '检查未通过', cancelled: '已取消', failed: '检查失败', interrupted: '检查进程已退出' };
const groups = computed(() => [
  { title: '准备条件', checks: state.job?.report?.checks?.filter(c => c.scope === 'prepare') || [] },
  { title: '正式切换条件', checks: state.job?.report?.checks?.filter(c => c.scope === 'activation') || [] },
]);
const canPrepare = computed(() => !active.value && !state.error && !relay.dirty && state.job?.report?.readyToPrepare && state.job.phase === 'complete');
const icon = check => check.state === 'passed' ? CheckCircleOutlined : check.state === 'blocked' ? ExclamationCircleOutlined : ClockCircleOutlined;
const time = value => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '';
async function copyPath() {
  try { await navigator.clipboard.writeText(state.prepared.root); message.success('准备包路径已复制'); }
  catch { message.warning('复制失败，请手动选择路径复制'); }
}
onMounted(start);
onBeforeUnmount(stop);
</script>

<template>
  <div class="environment-panel-heading">
    <div><h2 id="environment-migration">共享后端迁移</h2><p>检查迁移条件，生成准备包，并查看正式切换的阻塞原因。</p></div>
    <a-button type="primary" @click="open">迁移向导</a-button>
  </div>
  <div class="environment-notice"><ClockCircleOutlined aria-hidden="true" /><div><strong>正式切换暂不可用</strong><ul><li v-for="reason in blockers" :key="reason">{{ reason }}</li></ul></div></div>
  <div v-if="state.job" class="migration-job-summary" aria-live="polite">
    <div><strong>{{ labels[state.job.phase] || '状态待确认' }}</strong><p>{{ state.job.step }} · {{ time(state.job.updatedAt) }}</p></div>
    <a-button @click="open">{{ active ? '查看进度' : '查看准备结果' }}</a-button>
  </div>
  <p v-if="state.error && !state.open" class="environment-error" role="alert">准备状态读取失败：{{ state.error }}</p>

  <Modal v-model:open="state.open" title="共享后端迁移向导" wrap-class-name="migration-modal" :footer="null" :width="780" :destroy-on-close="false">
    <div class="migration-wizard">
      <p class="field-help">准备包包含启动与恢复工具。生成过程保留当前连接、进程和任务历史；正式切换前还需通过桌面工具验收。</p>
      <ol class="migration-steps" aria-label="迁移步骤">
        <li :class="{ done: state.job?.report?.readyToPrepare }"><span>1</span>检查条件</li>
        <li :class="{ done: state.prepared?.state === 'prepared' }"><span>2</span>生成准备包</li>
        <li><span>3</span>正式切换待验收</li>
      </ol>
      <div class="migration-toolbar">
        <a-button :loading="state.submitting && !active" :disabled="active || state.submitting || relay.dirty" @click="run('check')">检查迁移条件</a-button>
        <a-button :disabled="active || state.submitting || relay.dirty" @click="run('verify-desktop')">验证桌面兼容性</a-button>
        <a-button type="primary" :disabled="!canPrepare || state.submitting" @click="run('prepare')">生成准备包</a-button>
        <a-button v-if="active" :disabled="state.submitting || state.job.cancelRequested" @click="cancel">{{ state.job.cancelRequested ? '等待取消…' : '取消准备' }}</a-button>
        <a-button :loading="state.loading" @click="refresh">刷新进度</a-button>
      </div>
      <p class="field-help">兼容性验收会启动临时共享后端，读取真实桌面工具目录，不发送模型问题。结果在桌面重启、安装变化或 10 分钟后失效。</p>
      <p v-if="relay.dirty" class="environment-error">有未保存的设置，请先保存或取消更改。</p>
      <div v-if="state.error" class="environment-notice environment-notice-error" role="alert"><ExclamationCircleOutlined aria-hidden="true" /><div><strong>暂时无法确认最新进度</strong><p>{{ state.error }}。下方为上次结果，恢复连接后可刷新。</p></div></div>
      <div class="migration-progress" aria-live="polite">
        <strong>{{ state.job ? state.error ? '状态待重新确认' : labels[state.job.phase] : '尚未检查迁移条件' }}</strong>
        <p>{{ state.job?.error || state.job?.step || '点击“检查迁移条件”开始。' }}</p>
        <p v-if="active">{{ state.job.cancelRequested ? '将在当前文件操作结束后取消，并清理未完成的准备文件。' : '可关闭页面；重新打开后会恢复本次进度。' }}</p>
      </div>
      <section v-for="group in groups.filter(g => g.checks.length)" :key="group.title" class="migration-check-group" :class="{ 'environment-stale': state.error }">
        <h3>{{ group.title }}</h3>
        <ul class="migration-checks">
          <li v-for="check in group.checks" :key="check.id"><component :is="icon(check)" :class="check.state" aria-hidden="true" /><div><strong>{{ check.title }}</strong><p>{{ check.detail }}</p></div><span class="migration-check-result">{{ ({ passed: '通过', warning: '待处理', blocked: '未通过' })[check.state] }}</span></li>
        </ul>
      </section>
      <div v-if="state.prepared" class="migration-artifact">
        <strong>{{ state.prepared.state === 'prepared' ? '准备包已生成 · 尚未切换' : state.prepared.state === 'stale' ? '配置或版本已变化，请重新生成准备包' : '准备包已被移走或删除，请重新生成' }}</strong>
        <code>{{ state.prepared.root }}</code>
        <div><span class="field-help">{{ time(state.prepared.createdAt) }}</span><a-button size="small" @click="copyPath"><CopyOutlined aria-hidden="true" />复制路径</a-button></div>
      </div>
      <div class="migration-final-action"><p>正式切换需要桌面工具、双端任务和恢复流程全部验收通过。当前准备包仍禁止激活。</p><a-button disabled>切换共享后端</a-button></div>
    </div>
  </Modal>
</template>
