import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Docker Desktop on Windows doesn't forward file events into bind mounts, so poll for HMR.
  server: { watch: { usePolling: true } },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
