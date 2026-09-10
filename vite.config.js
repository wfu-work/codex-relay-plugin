import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  root: "web",
  base: "./",
  plugins: [vue()],
  build: {
    outDir: "../ui",
    emptyOutDir: true,
    assetsDir: "assets",
    // Keep the application entry small. Ant Design is used by every page, but
    // it should be cached independently from the app/router code. Route
    // components are already dynamic imports, so this also prevents a
    // dashboard page change from redownloading the UI framework.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('/node_modules/')) return undefined;
          if (id.includes('/ant-design-vue/')) return 'vendor-antd';
          if (id.includes('/@ant-design/icons-vue/')) return 'vendor-icons';
          if (id.includes('/vue-router/')) return 'vendor-router';
          if (id.includes('/@vue/') || id.includes('/vue/')) return 'vendor-vue';
          return 'vendor';
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
});
