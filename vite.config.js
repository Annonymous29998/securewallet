import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    wasm(),
    topLevelAwait()
  ],
  resolve: {
    alias: {
      process: path.resolve(__dirname, "node_modules/rollup-plugin-node-polyfills/polyfills/process-es6.js"),
      buffer: path.resolve(__dirname, "node_modules/rollup-plugin-node-polyfills/polyfills/buffer-es6.js"),
      util: path.resolve(__dirname, "node_modules/rollup-plugin-node-polyfills/polyfills/util.js"),
      stream: path.resolve(__dirname, "node_modules/rollup-plugin-node-polyfills/polyfills/stream.js"),
      string_decoder: path.resolve(__dirname, "node_modules/rollup-plugin-node-polyfills/polyfills/string-decoder.js"),
      "string_decoder/": path.resolve(__dirname, "node_modules/rollup-plugin-node-polyfills/polyfills/string-decoder.js"),
      events: path.resolve(__dirname, "node_modules/rollup-plugin-node-polyfills/polyfills/events.js"),
    }
  },
  define: {
    'global': 'globalThis',
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true
      }
    }
  }
});
