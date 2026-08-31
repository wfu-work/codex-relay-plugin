<script setup>
import { computed, ref } from 'vue';
import {
  ApiOutlined,
  CheckCircleFilled,
  EditOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  InfoCircleOutlined,
  KeyOutlined,
  LockOutlined,
  MobileOutlined,
  WifiOutlined,
} from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';
import { useRelay } from '../stores/relay.js';

const {
  state,
  configReady,
  relayStateValue,
  api,
  applyConfig,
  saveConfig,
  runConnection,
  connectionBusy,
} = useRelay();

const showEditor = ref(false);
const showToken = ref(false);
const advancedKeys = ref([]);

const tokenConfigured = computed(() => Boolean(state.status?.security?.tokenConfigured || state.form.token?.trim()));
const tokenTail = computed(() => state.form.token?.trim() ? state.form.token.trim().slice(-4) : '未设置');

async function saveAndTest() {
  if (!state.form.token && !tokenConfigured.value) {
    message.warning('还缺少连接令牌，请从 Relay 控制台复制后粘贴');
    return;
  }
  const saved = await saveConfig();
  if (!saved) return;
  const tested = await runConnection('test', '连接测试通过');
  if (tested) showEditor.value = false;
}

async function cancelEditing() {
  if (!state.dirty) {
    showEditor.value = false;
    return;
  }
  try {
    applyConfig(await api('/api/config'));
    showEditor.value = false;
    message.info('已放弃未保存的修改');
  } catch {
    message.error('无法恢复已保存的连接信息，请刷新页面后重试');
  }
}
</script>

<template>
  <section class="content-section route-page connection-page">
    <div class="section-title">
      <div>
        <div class="eyebrow">CONNECTION</div>
        <h1>连接设置</h1>
        <p>把 Relay 控制台签发的信息粘贴到这里即可。首次使用只需要填写 4 项内容，其余参数会自动处理。</p>
      </div>
      <a-tag v-if="configReady" color="success" class="setup-state-tag"><CheckCircleFilled /> 已配置</a-tag>
    </div>

    <a-card v-if="configReady && !showEditor" :bordered="false" class="surface-card setup-summary-card">
      <div class="setup-summary-head">
        <div class="setup-status-icon"><CheckCircleFilled /></div>
        <div>
          <div class="setup-kicker">READY TO CONNECT</div>
          <h2>连接信息已保存</h2>
          <p>你可以直接测试连接；如果提示令牌无效，请从 Relay 控制台重新签发一份。</p>
        </div>
      </div>
      <div class="connection-summary-grid">
        <div><span>Relay 地址</span><strong>{{ state.form.relayUrl }}</strong></div>
        <div><span>连接空间</span><strong>{{ state.form.spaceId }}</strong></div>
        <div><span>接入端 ID</span><strong>{{ state.form.endpointId }}</strong><em>连接令牌与远程路由均使用此 ID</em></div>
        <div><span>设备</span><strong>{{ state.form.deviceName || '未命名设备' }}</strong></div>
        <div><span>连接令牌</span><strong class="masked-value">•••• {{ tokenTail }}</strong><em>已安全保存</em></div>
      </div>
      <div class="setup-summary-actions">
        <a-button type="primary" :loading="state.loading.test" :disabled="connectionBusy || ['connecting', 'authenticating', 'reconnecting', 'disconnecting'].includes(relayStateValue)" @click="runConnection('test', '连接测试通过')"><WifiOutlined />测试连接</a-button>
        <a-button :disabled="connectionBusy" @click="showEditor = true"><EditOutlined />修改连接信息</a-button>
      </div>
    </a-card>

    <a-card v-else :bordered="false" class="surface-card setup-card">
      <div class="setup-intro">
        <div class="setup-kicker">{{ configReady ? '编辑连接' : '首次设置 · 约 1 分钟' }}</div>
        <h2>只需要复制 4 项信息</h2>
        <p>在 Relay 控制台签发连接令牌后，粘贴 Relay 地址、空间 ID、接入端 ID 和连接令牌。设备名称可选，用于在手机端识别这台电脑。</p>
      </div>

      <div class="setup-steps" aria-label="配置步骤">
        <div class="setup-step active"><span>1</span><div><strong>连接入口</strong><small>Relay 地址</small></div></div>
        <div class="setup-step active"><span>2</span><div><strong>空间身份</strong><small>空间 ID 与接入端 ID</small></div></div>
        <div class="setup-step active"><span>3</span><div><strong>完成认证</strong><small>连接令牌</small></div></div>
      </div>

      <a-alert class="setup-tip" type="info" show-icon>
        <template #icon><InfoCircleOutlined /></template>
        <template #message>从 Relay 控制台复制同一次签发的信息</template>
        <template #description>空间 ID、接入端 ID 和连接令牌必须来自同一次签发。手机端的 targetDeviceId 应填写这里的接入端 ID；本机路由标识由插件内部维护，无需配置。</template>
      </a-alert>

      <a-form layout="vertical" :model="state.form" @finish="saveAndTest">
        <a-form-item label="Relay 地址" name="relayUrl" required>
          <a-input v-model:value="state.form.relayUrl" placeholder="例如：wss://relay.example.com/v1/connect" autocomplete="url">
            <template #prefix><WifiOutlined /></template>
          </a-input>
          <div class="field-help">不知道填什么？直接复制 Relay 控制台显示的连接地址。公网地址需要使用 WSS。</div>
        </a-form-item>

        <a-row :gutter="[20, 2]">
          <a-col :xs="24" :sm="12">
            <a-form-item label="空间 ID" name="spaceId" required>
              <a-input v-model:value="state.form.spaceId" placeholder="例如：space_my_team" maxlength="128" />
              <div class="field-help">手机端和本机必须加入同一个连接空间。</div>
            </a-form-item>
          </a-col>
          <a-col :xs="24" :sm="12">
            <a-form-item label="接入端 ID" name="endpointId" required>
              <a-input v-model:value="state.form.endpointId" placeholder="例如：cli_215fb8fa148a41588851ced21bcd3ac9" maxlength="128" autocomplete="off">
                <template #prefix><ApiOutlined /></template>
              </a-input>
              <div class="field-help">必须与 Relay 控制台签发连接令牌时绑定的接入端 ID 完全一致。</div>
            </a-form-item>
          </a-col>
        </a-row>

        <a-form-item label="设备名称">
          <a-input v-model:value="state.form.deviceName" placeholder="例如：我的 Mac" maxlength="128">
            <template #prefix><MobileOutlined /></template>
          </a-input>
          <div class="field-help">可选，只用于远程界面识别设备。</div>
        </a-form-item>

        <a-form-item label="接入端类型">
          <a-input value="bridge / 网关" readonly />
          <div class="field-help">插件固定以 bridge（网关）类型连接 Relay。</div>
        </a-form-item>

        <a-form-item label="连接令牌" name="token" required>
          <a-input v-model:value="state.form.token" :type="showToken ? 'text' : 'password'" placeholder="粘贴 Relay 控制台签发的连接令牌" autocomplete="off">
            <template #prefix><KeyOutlined /></template>
            <template #suffix>
              <a-button type="text" html-type="button" class="field-icon-button" :aria-label="showToken ? '隐藏令牌' : '显示令牌'" @click="showToken = !showToken">
                <EyeOutlined v-if="!showToken" />
                <EyeInvisibleOutlined v-else />
              </a-button>
            </template>
          </a-input>
          <div class="field-help"><span v-if="tokenConfigured" class="token-state configured"><CheckCircleFilled /> 已保存，将安全存放在本机</span><span v-else>只在首次认证时发送，不会写入 URL 或日志。</span></div>
        </a-form-item>

        <a-collapse v-model:active-key="advancedKeys" ghost class="advanced-collapse setup-advanced">
          <a-collapse-panel key="credentials" header="高级凭据与自动续期（大多数情况不需要填写）">
            <p class="advanced-intro">只有 Relay 控制台同时提供了接入端授权凭证时，才需要填写这一部分。留空不会影响基本连接。</p>
            <a-row :gutter="[20, 2]">
              <a-col :xs="24" :lg="16">
                <a-form-item label="接入端授权凭证"><a-input v-model:value="state.form.endpointGrant" placeholder="Relay 控制台提供时再填写" autocomplete="off"><template #prefix><KeyOutlined /></template></a-input></a-form-item>
              </a-col>
              <a-col :xs="24" :lg="8">
                <a-form-item label="授权凭证过期时间（毫秒）"><a-input-number v-model:value="state.form.grantExpiresAt" :min="0" class="full-width" placeholder="由 Relay 返回" /></a-form-item>
              </a-col>
              <a-col :xs="24" :lg="24">
                <a-form-item label="令牌刷新地址"><a-input v-model:value="state.form.tokenEndpoint" placeholder="留空则按 Relay 地址自动推导" autocomplete="url" /><div class="field-help">公网地址必须使用 HTTPS。</div></a-form-item>
              </a-col>
              <a-col :xs="24" :lg="24">
                <a-form-item label="接入端公钥"><a-input :value="state.form.endpointPublicKey" readonly /><div class="field-help">这是本机身份公钥，只需提供给 Relay 控制台签发连接令牌，不需要手动修改。</div></a-form-item>
              </a-col>
            </a-row>
          </a-collapse-panel>
        </a-collapse>

        <div class="form-footer setup-form-footer">
          <span><LockOutlined /> 凭据只保存在本机安全存储</span>
          <div class="setup-form-actions">
            <a-button v-if="configReady" aria-label="取消编辑" :disabled="connectionBusy" @click="cancelEditing">取消</a-button>
            <a-button html-type="button" :loading="state.loading.save" :disabled="connectionBusy" @click="saveConfig">仅保存</a-button>
            <a-button html-type="submit" type="primary" :loading="state.loading.save || state.loading.test" :disabled="connectionBusy"><WifiOutlined />保存并测试连接</a-button>
          </div>
        </div>
      </a-form>
    </a-card>

    <section class="page-guidance compact-guidance" aria-labelledby="connection-guide-title">
      <div class="guidance-intro">
        <span>不确定怎么填？</span>
        <h2 id="connection-guide-title">从 Relay 控制台复制，不需要猜参数</h2>
        <p>Relay 地址、空间 ID、接入端 ID 和连接令牌必须来自同一次签发。其余信息由本机自动生成或按需续期。</p>
      </div>
      <div class="guidance-list">
        <div><i></i><p><strong>1. 先确认接入端身份</strong><span>在 Relay 控制台找到目标接入端，复制它的接入端 ID，并使用同一个接入端签发连接令牌。</span></p></div>
        <div><i></i><p><strong>2. 回到这里保存并测试</strong><span>点击“保存并测试连接”，成功后总览页会显示已连接状态。</span></p></div>
        <div><i></i><p><strong>3. 令牌无效先核对接入端</strong><span>接入端 ID、空间 ID、接入端类型和连接令牌必须匹配；重新签发时仍选择同一个网关接入端。</span></p></div>
      </div>
    </section>
  </section>
</template>
