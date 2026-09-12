<script setup>
import { onMounted, onBeforeUnmount } from 'vue';
import { ArrowRightOutlined, CloudServerOutlined } from '@ant-design/icons-vue';
import { useEnvironment } from '../stores/environment.js';
const { state, stale, start, stop } = useEnvironment();
onMounted(start);
onBeforeUnmount(stop);
</script>

<template>
  <section class="environment-summary" aria-label="运行环境摘要">
    <div class="environment-summary-icon"><CloudServerOutlined /></div>
    <div class="environment-summary-copy">
      <span class="field-help">运行环境</span>
      <strong>{{ state.error ? '环境状态暂不可用' : !state.data ? '正在检查运行环境…' : stale ? '环境检查已过期' : state.data.sharing.label }}</strong>
      <p>{{ state.error ? '请重新检查。之前的状态不能代表当前连接。' : state.data?.sharing.message || '分别检查 Relay 连接和本机 Codex App Server 状态。' }}</p>
    </div>
    <RouterLink to="/environment">检查与修复 <ArrowRightOutlined /></RouterLink>
  </section>
</template>
