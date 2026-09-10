<script setup>
import { CodeOutlined, FolderOpenOutlined, LockOutlined } from '@ant-design/icons-vue';
import { useRelay } from '../stores/relay.js';

const { state, saveConfig } = useRelay();
</script>

<template>
  <section class="content-section route-page">
    <div class="section-title">
      <div><div class="eyebrow">RUNTIME</div><h1>高级设置</h1><p>选择本机执行后端和连接方式，保存后应用。</p></div>
    </div>
    <a-card :bordered="false" class="surface-card advanced-card">
      <a-collapse ghost class="advanced-collapse" :active-key="['runtime']">
        <a-collapse-panel key="runtime" header="App Server 与重连参数">
          <a-form layout="vertical" :model="state.form">
            <a-row :gutter="[20, 2]">
              <a-col :span="24"><a-form-item label="执行后端">
                <a-select v-model:value="state.form.connectionMode" :options="[{ value: 'managed', label: '由插件管理进程' }, { value: 'shared', label: '连接共享后端' }]" />
                <div class="field-help">与桌面共用时，桌面和插件需要连接同一个 App Server。</div>
              </a-form-item></a-col>
              <a-col v-if="state.form.connectionMode === 'shared'" :span="24"><a-form-item label="共享后端地址">
                <a-input v-model:value="state.form.appServerEndpoint" placeholder="ws://127.0.0.1:4500 或 unix:///绝对路径/app-server.sock" />
                <div class="field-help">连接已经运行的本机服务。插件重启只恢复连接，任务继续由共享服务执行。</div>
              </a-form-item></a-col>
              <a-col v-if="state.form.connectionMode === 'managed'" :xs="24" :sm="12"><a-form-item label="Codex 命令"><a-input v-model:value="state.form.codexExecutable"><template #prefix><CodeOutlined /></template></a-input><div class="field-help">填写可执行文件名称或绝对路径；默认使用当前环境中的 codex。</div></a-form-item></a-col>
              <a-col :xs="24" :sm="12"><a-form-item label="默认工作目录"><a-input v-model:value="state.form.defaultWorkingDirectory" placeholder="留空使用插件目录"><template #prefix><FolderOpenOutlined /></template></a-input><div class="field-help">远程创建会话时使用的起始目录，可继续通过项目白名单限制范围。</div></a-form-item></a-col>
              <a-col :xs="24" :sm="12"><a-form-item label="Relay 心跳间隔（秒）"><a-input-number v-model:value="state.form.heartbeatSeconds" :min="5" :max="300" class="full-width" /><div class="field-help">间隔越短，断线发现越快；网络不稳定时可适当增大。</div></a-form-item></a-col>
              <a-col :xs="24" :sm="12"><a-form-item label="Relay 最大重连间隔（秒）"><a-input-number v-model:value="state.form.reconnectMaxSeconds" :min="5" :max="600" class="full-width" /><div class="field-help">限制 Relay 连续失败后的最长等待时间。共享后端独立重试，最长间隔 30 秒。</div></a-form-item></a-col>
              <a-col :xs="24" :sm="12"><div class="switch-setting"><a-switch v-model:checked="state.form.autoConnect" /><span>插件启动后自动连接 Relay</span></div></a-col>
              <a-col v-if="state.form.connectionMode === 'managed'" :xs="24" :sm="12"><div class="switch-setting"><a-switch v-model:checked="state.form.autoStartAppServer" /><span>连接时自动启动 Codex App Server</span></div></a-col>
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
        <p>只有在自定义 Codex 安装路径、固定项目目录或网络频繁断开时，才需要调整这些参数。</p>
      </div>
      <div class="guidance-list">
        <div><i></i><p><strong>自动连接减少重复操作</strong><span>插件启动后会使用已保存的 Relay 配置恢复连接；凭据缺失或无效时仍会停止并记录原因。</span></p></div>
        <div><i></i><p><strong>共享连接自动恢复</strong><span>共享后端断开时会逐步重试并恢复任务订阅。后端地址和状态可在总览中查看。</span></p></div>
        <div><i></i><p><strong>重连采用逐步退避</strong><span>短暂网络波动会快速重试，连续失败后逐渐延长等待时间，直到达到设置的最大间隔。</span></p></div>
      </div>
    </section>
  </section>
</template>
