import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    watch: {
      ignored: ["**/src-tauri/**"]
    }
  },
  build: {
    target: "es2021",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: process.env.CHEATLOCK_ENABLE_SOURCEMAPS === "true" ? "hidden" : false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react") || id.includes("react-dom") || id.includes("react-router-dom")) return "react-vendor";
          if (id.includes("@tanstack")) return "query-vendor";
          if (id.includes("socket.io-client") || id.includes("engine.io-client")) return "socket-vendor";
          if (id.includes("@tauri-apps")) return "tauri-vendor";
          if (id.includes("framer-motion")) return "motion-vendor";
          return "vendor";
        },
      },
    },
  },
  esbuild: {
    drop: process.env.TAURI_DEBUG ? [] : ["console", "debugger"]
  }
});
