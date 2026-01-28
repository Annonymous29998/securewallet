import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      protocolImports: true,
    }),
    wasm(),
    topLevelAwait()
  ],
  resolve: {
    alias: {
      'string_decoder/': 'rollup-plugin-node-polyfills/polyfills/string-decoder.js',
      'string_decoder': 'rollup-plugin-node-polyfills/polyfills/string-decoder.js',
      'buffer': 'rollup-plugin-node-polyfills/polyfills/buffer-es6.js',
      'process': 'rollup-plugin-node-polyfills/polyfills/process-es6.js',
      'util': 'rollup-plugin-node-polyfills/polyfills/util.js',
      'readable-stream': 'rollup-plugin-node-polyfills/polyfills/readable-stream/readable.js',
      'stream': 'rollup-plugin-node-polyfills/polyfills/stream.js',
    }
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
