<script setup>
import { CheckCircleFilled, KeyOutlined, LockOutlined, MobileOutlined, WifiOutlined } from '@ant-design/icons-vue';
import { useRelay } from '../stores/relay.js';

const { state, saveConfig } = useRelay();
</script>

<template>
  <section class="content-section route-page">
    <div class="section-title">
      <div><div class="eyebrow">CONNECTION</div><h1>连接设置</h1><p>Connector 只向外建立 WebSocket，不开放本机公网端口。</p></div>
    </div>
    <a-card :bordered="false" class="surface-card">
      <a-form layout="vertical" :model="state.form" @finish="saveConfig">
        <a-row :gutter="[20, 2]">
          <a-col :xs="24" :lg="16"><a-form-item label="Relay 地址" name="relayUrl" required><a-input v-model:value="state.form.relayUrl" placeholder="wss://relay.example.com/ws" autocomplete="url"><template #prefix><WifiOutlined /></template></a-input><div class="field-help">公网连接必须使用 WSS；仅回环地址允许 WS。</div></a-form-item></a-col>
          <a-col :xs="24" :sm="12" :lg="8"><a-form-item label="房间 ID" name="roomId" required><a-input v-model:value="state.form.roomId" placeholder="studio-mac" maxlength="128" /></a-form-item></a-col>
          <a-col :xs="24" :sm="12" :lg="8"><a-form-item label="设备名称"><a-input v-model:value="state.form.deviceName" placeholder="MacBook Pro" maxlength="128"><template #prefix><MobileOutlined /></template></a-input></a-form-item></a-col>
          <a-col :xs="24" :lg="16"><a-form-item label="Token"><template #extra><span class="token-state" :class="{ configured: state.status?.security?.tokenConfigured }"><CheckCircleFilled v-if="state.status?.security?.tokenConfigured" />{{ state.status?.security?.tokenConfigured ? '已保存' : '未配置' }}</span></template><a-input v-model:value="state.form.token" placeholder="输入 Relay Token" autocomplete="off"><template #prefix><KeyOutlined /></template></a-input><div class="field-help">Token 会保存到插件配置目录（跨平台可用），并在此处回显；日志不会记录它。</div></a-form-item></a-col>
        </a-row>
        <div class="form-footer"><span><LockOutlined /> 配置只保存在本机</span><a-button html-type="submit" type="primary" :loading="state.loading.save">保存连接配置</a-button></div>
      </a-form>
    </a-card>

    <section class="page-guidance" aria-labelledby="connection-guide-title">
      <div class="guidance-intro">
        <span>配置说明</span>
        <h2 id="connection-guide-title">让本机与手机加入同一个可信房间</h2>
        <p>保存配置不会自动放开远程写权限。连接建立后，你仍可以在权限页面逐项决定手机端能够执行哪些操作。</p>
      </div>
      <div class="guidance-list">
        <div><i></i><p><strong>Relay 地址决定连接入口</strong><span>生产环境建议使用可信证书的 WSS 地址，避免凭据和会话事件在传输过程中暴露。</span></p></div>
        <div><i></i><p><strong>房间 ID 用于匹配设备</strong><span>本机插件和手机端必须使用相同房间；设备名称只用于远程界面中识别这台 Codex 主机。</span></p></div>
        <div><i></i><p><strong>Token 会在本机保留</strong><span>保存后 Token 会从本地配置目录加载并回显在输入框中，日志始终不会记录它。</span></p></div>
      </div>
    </section>
  </section>
</template>
