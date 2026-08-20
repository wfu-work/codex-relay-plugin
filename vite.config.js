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
    // This dashboard is served locally as one route; 700 kB keeps the build
    // warning meaningful without splitting the Ant Design runtime arbitrarily.
    chunkSizeWarningLimit: 700,
  },
});
