<script setup>
import AppShell from './layouts/AppShell.vue';
import { useRelay } from './stores/relay.js';

const { themeConfig } = useRelay();
</script>

<template>
  <a-config-provider :theme="themeConfig">
    <AppShell />
  </a-config-provider>
</template>
