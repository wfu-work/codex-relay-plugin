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
          <a-col :xs="24" :lg="16"><a-form-item label="Relay 地址" name="relayUrl" required><a-input v-model:value="state.form.relayUrl" placeholder="wss://relay.example.com/v1/connect" autocomplete="url"><template #prefix><WifiOutlined /></template></a-input><div class="field-help">Protocol v1 使用 /v1/connect；公网连接必须使用 WSS，仅回环地址允许 WS。</div></a-form-item></a-col>
          <a-col :xs="24" :sm="12" :lg="8"><a-form-item label="Space ID" name="spaceId" required><a-input v-model:value="state.form.spaceId" placeholder="studio-mac" maxlength="128" /></a-form-item></a-col>
          <a-col :xs="24" :sm="12" :lg="8"><a-form-item label="设备名称"><a-input v-model:value="state.form.deviceName" placeholder="MacBook Pro" maxlength="128"><template #prefix><MobileOutlined /></template></a-input></a-form-item></a-col>
          <a-col :xs="24" :lg="16"><a-form-item label="Connect Token"><template #extra><span class="token-state" :class="{ configured: state.status?.security?.tokenConfigured }"><CheckCircleFilled v-if="state.status?.security?.tokenConfigured" />{{ state.status?.security?.tokenConfigured ? '已保存' : '未配置' }}</span></template><a-input v-model:value="state.form.token" placeholder="输入短期 Connect Token" autocomplete="off"><template #prefix><KeyOutlined /></template></a-input><div class="field-help">Connect Token 由 Relay 控制面签发并绑定本机 Endpoint 公钥；只在首帧发送，日志和 URL 不会记录。</div></a-form-item></a-col>
          <a-col :xs="24" :lg="16"><a-form-item label="Endpoint Grant"><a-input v-model:value="state.form.endpointGrant" placeholder="输入短期 Endpoint Grant" autocomplete="off"><template #prefix><KeyOutlined /></template></a-input><div class="field-help">Grant 只用于 HTTPS 自动续期，不会用于 WebSocket 握手；请与 Token 一起存入本机安全存储。</div></a-form-item></a-col>
          <a-col :xs="24" :lg="8"><a-form-item label="Grant 过期时间（毫秒）"><a-input-number v-model:value="state.form.grantExpiresAt" :min="0" class="full-width" placeholder="由 Relay 返回" /></a-form-item></a-col>
          <a-col :xs="24" :lg="16"><a-form-item label="Token 刷新地址"><a-input v-model:value="state.form.tokenEndpoint" placeholder="https://relay.example.com/api/connect-tokens/refresh" autocomplete="url" /><div class="field-help">公网必须使用 HTTPS；仅本机调试允许 http://127.0.0.1 或 localhost。</div></a-form-item></a-col>
          <a-col :xs="24" :lg="16"><a-form-item label="Endpoint 公钥"><a-input :value="state.form.endpointPublicKey" readonly /><div class="field-help">签发 Connect Token 时将此 Ed25519 公钥提交给 Relay。私钥只保存在本机安全文件。</div></a-form-item></a-col>
        </a-row>
        <div class="form-footer"><span><LockOutlined /> 配置只保存在本机</span><a-button html-type="submit" type="primary" :loading="state.loading.save">保存连接配置</a-button></div>
      </a-form>
    </a-card>

    <section class="page-guidance" aria-labelledby="connection-guide-title">
      <div class="guidance-intro">
        <span>配置说明</span>
        <h2 id="connection-guide-title">让本机与手机加入同一个可信 Space</h2>
        <p>保存配置不会自动放开远程写权限。连接建立后，你仍可以在权限页面逐项决定手机端能够执行哪些操作。</p>
      </div>
      <div class="guidance-list">
        <div><i></i><p><strong>Relay 地址决定连接入口</strong><span>生产环境建议使用可信证书的 WSS 地址，避免凭据和会话事件在传输过程中暴露。</span></p></div>
        <div><i></i><p><strong>Space ID 用于隔离端点</strong><span>本机插件和手机端必须使用同一个 Space；设备名称只用于远程界面中识别这台 Codex 主机。</span></p></div>
        <div><i></i><p><strong>Connect Token 绑定公钥</strong><span>短期 Token 与 Endpoint 公钥成对使用，撤销或过期后需从 Relay 控制面重新签发。</span></p></div>
      </div>
    </section>
  </section>
</template>
