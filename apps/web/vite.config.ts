import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * The web build.
 *
 * The dev server proxies `/api` to the API application, so the browser only
 * ever talks to one origin and no CORS configuration is needed in
 * development.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: {
    // MapLibre loads its renderer in a module worker.
    format: "es",
  },
  optimizeDeps: {
    // Pre-bundling MapLibre rewrites the worker URL and the worker then
    // fails to load, so the library is served as it is written.
    exclude: ["maplibre-gl"],
  },
  build: {
    // The vendor libraries are split out so the application chunk stays
    // readable in a diff and the browser caches them across deploys.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          tanstack: ["@tanstack/react-query", "@tanstack/react-router"],
          maplibre: ["maplibre-gl"],
          icons: ["lucide-react"],
        },
      },
    },
  },
  server: {
    port: 3010,
    // Never drift to another port: the API owns 3011, and a silent fallback
    // would point the proxy at the dev server itself.
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:3011",
        changeOrigin: true,
      },
    },
  },
});
