<script setup>
import {
  ApiOutlined,
  CodeOutlined,
  ControlOutlined,
  DisconnectOutlined,
  FolderOpenOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons-vue';
import { useRelay } from '../stores/relay.js';

const permissionItems = [
  { key: 'readThreads', title: '查看会话', description: '读取 thread 列表、快照与实时事件', tag: 'READ', icon: ApiOutlined },
  { key: 'sendMessages', title: '发送消息', description: '在选定 thread 中启动新的 turn', tag: 'WRITE', icon: CodeOutlined },
  { key: 'createThreads', title: '创建会话', description: '在允许的项目目录中新建 thread', tag: 'WRITE', icon: FolderOpenOutlined },
  { key: 'steerTurns', title: '调整进行中的任务', description: '向当前 turn 发送 steer 指令', tag: 'WRITE', icon: ControlOutlined },
  { key: 'interruptTurns', title: '停止任务', description: '中断指定的进行中 turn', tag: 'CONTROL', icon: DisconnectOutlined },
  { key: 'respondToApprovals', title: '远程审批', description: '允许手机端批准命令和文件变更', tag: 'SENSITIVE', icon: SafetyCertificateOutlined, danger: true },
];

const { state, saveConfig } = useRelay();
</script>

<template>
  <section class="content-section route-page">
    <div class="section-title">
      <div><div class="eyebrow">REMOTE POLICY</div><h1>远程权限</h1><p>从最小权限开始。危险动作保持关闭，直到 Relay 和手机端都完成鉴权。</p></div>
    </div>
    <a-card :bordered="false" class="surface-card policy-card">
      <div class="readonly-row"><div class="setting-icon safe"><LockOutlined /></div><div><strong>只读模式</strong><p>禁止所有远程写操作，保留状态和会话查看。</p></div><a-switch v-model:checked="state.form.readOnly" /></div>
      <a-divider />
      <div class="permission-list">
        <div v-for="item in permissionItems" :key="item.key" class="permission-row" :class="{ danger: item.danger }">
          <div class="setting-icon" :class="{ danger: item.danger }"><component :is="item.icon" /></div>
          <div class="permission-copy"><strong>{{ item.title }}</strong><span>{{ item.description }}</span></div>
          <a-tag :color="item.danger ? 'warning' : undefined">{{ item.tag }}</a-tag>
          <a-switch v-model:checked="state.form.permissions[item.key]" :disabled="state.form.readOnly" />
        </div>
      </div>
      <a-divider />
      <a-form-item label="项目白名单" class="allowlist-item"><a-textarea v-model:value="state.form.allowedProjects" :rows="4" :disabled="state.form.readOnly" spellcheck="false" placeholder="每行一个绝对路径，例如：&#10;/Users/me/projects/demo" /><div class="field-help">非空时，远程创建 turn/thread 只能使用这些目录及其子目录。</div></a-form-item>
      <div class="form-footer page-form-footer"><span><LockOutlined /> 权限变更需保存后生效</span><a-button type="primary" :loading="state.loading.save" @click="saveConfig">保存权限设置</a-button></div>
    </a-card>

    <section class="page-guidance" aria-labelledby="permission-guide-title">
      <div class="guidance-intro">
        <span>安全建议</span>
        <h2 id="permission-guide-title">按使用场景逐步开放能力</h2>
        <p>首次连接建议保持只读，先确认会话同步、设备身份和房间成员都符合预期，再开放写入或控制能力。</p>
      </div>
      <div class="guidance-list">
        <div><i></i><p><strong>日常查看只需读取权限</strong><span>如果手机端只用于观察任务进度，开启“查看会话”即可，不需要允许发送消息或创建会话。</span></p></div>
        <div><i></i><p><strong>控制权限应按需开启</strong><span>调整任务和停止任务会改变正在运行的 Codex 工作流，适合明确需要远程干预时使用。</span></p></div>
        <div><i></i><p><strong>远程审批是敏感权限</strong><span>它可能放行命令或文件变更。启用前请确认 Relay、房间 Token 和手机端设备都由你控制。</span></p></div>
        <div><i></i><p><strong>用白名单限制项目范围</strong><span>每行填写一个绝对路径，可以把远程创建会话的范围限制在指定目录及其子目录内。</span></p></div>
      </div>
    </section>
  </section>
</template>
