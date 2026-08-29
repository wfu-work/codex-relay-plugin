<script setup>
import { CheckCircleOutlined, ClearOutlined, ExclamationCircleFilled, FileSearchOutlined, ReloadOutlined } from '@ant-design/icons-vue';
import { useRelay } from '../stores/relay.js';

const { state, shortTime, refreshLogs, clearLogs, runDiagnostics } = useRelay();
</script>

<template>
  <section class="content-section diagnostics-section route-page">
    <div class="section-title">
      <div><div class="eyebrow">OBSERVABILITY</div><h1>诊断与日志</h1><p>在出现连接问题时，从本机 Codex、配置和 Relay 凭据三处快速定位。</p></div>
      <a-button :loading="state.loading.diagnostics" @click="runDiagnostics"><FileSearchOutlined />运行诊断</a-button>
    </div>
    <a-card :bordered="false" class="surface-card diagnostics-card">
      <div v-if="!state.diagnostics" class="diagnostics-empty"><FileSearchOutlined /><strong>准备好检查 Relay</strong><span>运行诊断，检查 Codex 命令、本地配置和 Relay 凭据。</span></div>
      <div v-else class="checks" aria-live="polite"><div v-for="check in state.diagnostics.checks" :key="check.name" class="check-row"><CheckCircleOutlined v-if="check.ok" class="check-ok" /><ExclamationCircleFilled v-else class="check-fail" /><div><strong>{{ check.name }}</strong><span>{{ check.ok ? (check.version || JSON.stringify(check.details || { ok: true })) : (check.error || JSON.stringify(check.details || {})) }}</span></div><a-tag :color="check.ok ? 'success' : 'error'">{{ check.ok ? '通过' : '失败' }}</a-tag></div></div>
      <a-divider />
      <div class="log-heading"><span>RECENT LOCAL LOG</span><div><a-button type="text" size="small" @click="refreshLogs"><ReloadOutlined />刷新</a-button><a-button type="text" danger size="small" @click="clearLogs"><ClearOutlined />清空</a-button></div></div>
      <div v-if="!state.logs.length" class="log-empty">暂无日志</div>
      <div v-else class="log-table"><div v-for="entry in [...state.logs].reverse()" :key="entry.timestamp + entry.message" class="log-row"><time>{{ shortTime(entry.timestamp) }}</time><span class="log-level" :class="entry.level">{{ entry.level.toUpperCase() }}</span><span class="log-component">{{ entry.component }}</span><span>{{ entry.message }}</span></div></div>
    </a-card>

    <section class="page-guidance" aria-labelledby="diagnostics-guide-title">
      <div class="guidance-intro">
        <span>排查顺序</span>
        <h2 id="diagnostics-guide-title">先确认本机环境，再检查远程链路</h2>
        <p>诊断结果用于判断问题发生在哪个阶段；最近日志则提供连接、认证和运行时状态变化的时间线。</p>
      </div>
      <div class="guidance-list">
        <div><i></i><p><strong>先运行本机诊断</strong><span>确认 Codex 命令可用、配置格式正确，并且连接所需凭据已经保存。</span></p></div>
        <div><i></i><p><strong>再到总览测试连接</strong><span>测试会执行 Relay 握手和认证，但不会持续保持连接，适合验证地址、房间和 Token。</span></p></div>
        <div><i></i><p><strong>最后查看错误时间线</strong><span>按时间对照组件和错误信息，判断是网络断开、认证失败，还是本机 App Server 未就绪。</span></p></div>
        <div><i></i><p><strong>分享日志前检查路径信息</strong><span>日志不会代替完整配置，但仍可能包含 Relay 地址或本机项目路径，请在对外发送前确认内容。</span></p></div>
      </div>
    </section>
  </section>
</template>
