<script setup>
import { ApiOutlined, CloudServerOutlined } from '@ant-design/icons-vue';
import { useRelay } from '../stores/relay.js';

const {
  state,
  relayStateValue,
  relayLabel,
  relayStatusType,
  appServerLabel,
  configReady,
  shortTime,
  runConnection,
} = useRelay();
</script>

<template>
  <div class="route-page overview-page">
    <section class="hero-section">
      <div class="hero-copy">
        <div class="eyebrow"><span class="eyebrow-dot"></span>HOST ↔ RELAY BRIDGE</div>
        <h1>把 Codex 带到<br /><span>你在的地方。</span></h1>
        <p>连接本机 Codex 与你的 Relay 房间。会话事件实时同步，远程写操作始终受本机权限策略保护。</p>
        <div class="hero-actions">
          <a-button type="primary" size="large" :loading="state.loading.connect" :disabled="['connected', 'connecting', 'authenticating'].includes(relayStateValue)" @click="runConnection('connect', 'Relay 已连接')"><ApiOutlined />连接 Relay</a-button>
          <a-button size="large" :loading="state.loading.test" @click="runConnection('test', 'Relay 握手和认证通过')">测试连接</a-button>
          <a-button type="text" size="large" :disabled="relayStateValue === 'disconnected'" :loading="state.loading.disconnect" @click="runConnection('disconnect', 'Relay 已断开')">断开</a-button>
        </div>
      </div>
      <div class="hero-signal">
        <div class="signal-top"><span>RELAY SIGNAL</span><a-tag :color="relayStatusType">{{ relayLabel }}</a-tag></div>
        <div class="signal-main">
          <span class="signal-pulse" :class="relayStateValue"></span>
          <div>
            <strong>{{ state.status?.relay?.lastError || (state.status?.relay?.connectedAt ? '连接于 ' + shortTime(state.status.relay.connectedAt) : '等待建立安全连接') }}</strong>
            <span>{{ state.form.relayUrl || '配置 Relay 地址后开始' }}</span>
          </div>
        </div>
        <a-divider />
        <div class="signal-foot"><span><CloudServerOutlined /> App Server</span><strong>{{ appServerLabel.toUpperCase() }}</strong></div>
      </div>
    </section>

    <section class="metric-strip" aria-label="运行指标">
      <div><span>房间</span><strong>{{ state.status?.room?.roomId || '未配置' }}</strong><small>{{ state.status?.room?.deviceName || '设备名称待设置' }}</small></div>
      <div><span>设备</span><strong>{{ state.status?.room?.deviceName || '—' }}</strong><small>{{ state.status?.room?.deviceId || 'Device ID 待生成' }}</small></div>
      <div><span>事件序号</span><strong>{{ state.status?.protocol?.latestSequence ?? 0 }}</strong><small>最近心跳 {{ shortTime(state.status?.relay?.lastHeartbeat) }}</small></div>
      <div><span>凭据</span><strong>{{ configReady ? '已就绪' : '待配置' }}</strong><small>{{ state.status?.security?.tokenConfigured ? 'Token 已安全保存' : '尚未保存 Token' }}</small></div>
    </section>

    <section class="overview-next">
      <div><span>初次使用</span><strong>先完成 Relay 地址与凭据配置</strong><p>配置保存后返回总览测试连接；远程写操作仍需在权限页单独开启。</p></div>
      <RouterLink to="/connection">前往连接设置 <span aria-hidden="true">→</span></RouterLink>
    </section>
  </div>
</template>
