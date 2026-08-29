<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import {
  DashboardOutlined,
  FileSearchOutlined,
  LinkOutlined,
  LockOutlined,
  MenuOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
} from '@ant-design/icons-vue';
import { useRelay } from '../stores/relay.js';

const route = useRoute();
const mobileNavOpen = ref(false);
const {
  state,
  relayStateValue,
  relayLabel,
  relayStatusType,
  securityLabel,
  securityType,
  setTheme,
  refreshStatus,
  start,
  stop,
} = useRelay();

const navItems = [
  { to: '/overview', label: '总览', icon: DashboardOutlined },
  { to: '/connection', label: '连接设置', icon: LinkOutlined },
  { to: '/permissions', label: '远程权限', icon: SafetyCertificateOutlined },
  { to: '/advanced', label: '高级设置', icon: SettingOutlined },
  { to: '/diagnostics', label: '诊断日志', icon: FileSearchOutlined },
];

const pageTitle = computed(() => route.meta.title || 'Relay 管理');

function closeMobileNav() {
  mobileNavOpen.value = false;
}

onMounted(start);
onBeforeUnmount(stop);
</script>

<template>
  <a-layout class="app-layout">
    <button v-if="mobileNavOpen" class="nav-scrim" type="button" aria-label="关闭导航" @click="closeMobileNav"></button>
    <a-layout-sider :width="252" class="app-sider" :class="{ 'mobile-open': mobileNavOpen }">
      <div class="sider-inner">
        <div class="brand-lockup">
          <img class="brand-mark" src="/recodex-icon.svg" alt="recodex" />
          <div><strong>Codex Relay</strong><span>本地连接控制台</span></div>
        </div>

        <div class="sider-label">控制台</div>
        <nav class="side-nav" aria-label="控制台页面">
          <RouterLink v-for="item in navItems" :key="item.to" :to="item.to" @click="closeMobileNav">
            <component :is="item.icon" />
            <span class="nav-label">{{ item.label }}</span>
          </RouterLink>
        </nav>

        <div class="sider-spacer"></div>
        <div class="sider-status">
          <div class="status-line">
            <span class="live-dot" :class="relayStateValue"></span>
            <span>{{ relayLabel }}</span>
            <a-tag :color="relayStatusType">{{ relayStateValue === 'connected' ? 'LIVE' : 'IDLE' }}</a-tag>
          </div>
          <div class="sider-room">{{ state.status?.room?.roomId || '尚未配置房间' }}</div>
        </div>
        <div class="theme-switcher" aria-label="主题">
          <button :class="{ active: state.themeMode === 'light' }" type="button" @click="setTheme('light')">浅色</button>
          <button :class="{ active: state.themeMode === 'dark' }" type="button" @click="setTheme('dark')">深色</button>
        </div>
        <div class="sider-footer">Codex Relay · protocol v1</div>
      </div>
    </a-layout-sider>

    <a-layout class="content-layout">
      <a-layout-header class="topbar">
        <div class="topbar-left">
          <a-button type="text" class="mobile-menu" aria-label="打开导航" @click="mobileNavOpen = !mobileNavOpen"><MenuOutlined /></a-button>
          <strong class="topbar-title">{{ pageTitle }}</strong>
        </div>
        <div class="topbar-right">
          <span v-if="state.dirty" class="dirty-indicator"><span></span>有未保存更改</span>
          <a-tag :color="securityType" class="security-tag"><LockOutlined /> {{ securityLabel }}</a-tag>
          <a-button type="text" class="topbar-icon" aria-label="刷新状态" @click="refreshStatus()"><ReloadOutlined /></a-button>
        </div>
      </a-layout-header>

      <a-layout-content class="main-content">
        <div class="content-width">
          <RouterView v-slot="{ Component, route: currentRoute }">
            <Transition name="route-fade" mode="out-in">
              <component :is="Component" :key="currentRoute.name" />
            </Transition>
          </RouterView>
        </div>
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>
