import { createRouter, createWebHashHistory } from 'vue-router';

const routes = [
  { path: '/', redirect: '/overview' },
  { path: '/overview', name: 'overview', component: () => import('../pages/OverviewPage.vue'), meta: { title: '总览' } },
  { path: '/connection', name: 'connection', component: () => import('../pages/ConnectionPage.vue'), meta: { title: '连接设置' } },
  { path: '/permissions', name: 'permissions', component: () => import('../pages/PermissionsPage.vue'), meta: { title: '远程权限' } },
  { path: '/advanced', name: 'advanced', component: () => import('../pages/AdvancedPage.vue'), meta: { title: '高级设置' } },
  { path: '/diagnostics', name: 'diagnostics', component: () => import('../pages/DiagnosticsPage.vue'), meta: { title: '诊断日志' } },
  { path: '/:pathMatch(.*)*', redirect: '/overview' },
];

export function createRelayRouter() {
  return createRouter({
    history: createWebHashHistory(),
    routes,
    scrollBehavior: () => ({ top: 0 }),
  });
}
