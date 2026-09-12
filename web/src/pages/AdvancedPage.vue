<script setup>
import { CloudServerOutlined, CodeOutlined, FolderOpenOutlined, LockOutlined } from '@ant-design/icons-vue';
import { useRelay } from '../stores/relay.js';

const { state, saveConfig } = useRelay();
</script>

<template>
  <section class="content-section route-page">
    <div class="section-title">
      <div><div class="eyebrow">RUNTIME</div><h1>高级设置</h1><p>配置本机 Codex 执行环境和 Relay 连接参数，保存后应用。</p></div>
    </div>
    <a-card :bordered="false" class="surface-card advanced-card">
      <a-collapse ghost class="advanced-collapse" :active-key="['runtime']">
        <a-collapse-panel key="runtime" header="App Server 与重连参数">
          <a-form layout="vertical" :model="state.form">
            <a-row :gutter="[20, 2]">
              <a-col :xs="24" :sm="12"><a-form-item label="App Server 连接模式"><a-select v-model:value="state.form.connectionMode" class="full-width"><a-select-option value="managed">插件托管（独立进程）</a-select-option><a-select-option value="shared">共享桌面 App Server</a-select-option></a-select><div class="field-help">共享模式不会启动第二个 Codex 进程，Flutter Relay 和桌面端连接同一个 App Server。</div></a-form-item></a-col>
              <a-col v-if="state.form.connectionMode === 'shared'" :xs="24" :sm="12"><a-form-item label="共享 App Server 地址"><a-input v-model:value="state.form.appServerEndpoint" placeholder="unix:///Users/你的用户名/.codex/app-server-control/app-server-control.sock"><template #prefix><CloudServerOutlined /></template></a-input><div class="field-help">必须是桌面共享后端提供的 unix:// Socket 或本机 ws:// 地址。</div></a-form-item></a-col>
              <a-col :xs="24" :sm="12"><a-form-item label="Codex 命令"><a-input v-model:value="state.form.codexExecutable"><template #prefix><CodeOutlined /></template></a-input><div class="field-help">仅托管模式使用；共享模式不会通过此命令启动新进程。</div></a-form-item></a-col>
              <a-col :xs="24" :sm="12"><a-form-item label="默认工作目录"><a-input v-model:value="state.form.defaultWorkingDirectory" placeholder="留空使用插件目录"><template #prefix><FolderOpenOutlined /></template></a-input><div class="field-help">远程创建会话时使用的起始目录，可继续通过项目白名单限制范围。</div></a-form-item></a-col>
              <a-col :xs="24" :sm="12"><a-form-item label="Relay 心跳间隔（秒）"><a-input-number v-model:value="state.form.heartbeatSeconds" :min="5" :max="300" class="full-width" /><div class="field-help">间隔越短，断线发现越快；网络不稳定时可适当增大。</div></a-form-item></a-col>
              <a-col :xs="24" :sm="12"><a-form-item label="Relay 最大重连间隔（秒）"><a-input-number v-model:value="state.form.reconnectMaxSeconds" :min="5" :max="600" class="full-width" /><div class="field-help">限制 Relay 连续失败后的最长等待时间。</div></a-form-item></a-col>
              <a-col :xs="24" :sm="12"><div class="switch-setting"><a-switch v-model:checked="state.form.autoConnect" /><span>插件启动后自动连接 Relay</span></div></a-col>
              <a-col :xs="24" :sm="12"><div class="switch-setting"><a-switch v-model:checked="state.form.autoStartAppServer" :disabled="state.form.connectionMode === 'shared'" /><span>{{ state.form.connectionMode === 'shared' ? '共享模式不启动 App Server' : '连接时自动启动 Codex App Server' }}</span></div></a-col>
            </a-row>
          </a-form>
        </a-collapse-panel>
      </a-collapse>
      <div class="form-footer page-form-footer"><span><LockOutlined /> 参数只作用于本机运行时</span><a-button type="primary" :loading="state.loading.save" @click="saveConfig">保存高级设置</a-button></div>
    </a-card>

    <section class="page-guidance" aria-labelledby="runtime-guide-title">
      <div class="guidance-intro">
        <span>运行策略</span>
        <h2 id="runtime-guide-title">默认值适合持续在线的本机 Connector</h2>
        <p>共享模式要求桌面端和 Relay 指向同一个本机 App Server；如果共享端点不可用，连接会保持失败并显示具体原因。</p>
      </div>
      <div class="guidance-list">
        <div><i></i><p><strong>自动连接减少重复操作</strong><span>插件启动后会使用已保存的 Relay 配置恢复连接；凭据缺失或无效时仍会停止并记录原因。</span></p></div>
        <div><i></i><p><strong>共享模式复用桌面执行后端</strong><span>启用共享后插件只建立客户端连接，不会抢占桌面会话或重复启动 App Server。</span></p></div>
        <div><i></i><p><strong>重连采用逐步退避</strong><span>短暂网络波动会快速重试，连续失败后逐渐延长等待时间，直到达到设置的最大间隔。</span></p></div>
      </div>
    </section>
  </section>
</template>
