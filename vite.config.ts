import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The app lives in app/. GitHub Pages serves from a project subpath
// (https://<user>.github.io/<repo>/), so base must match the repo name.
// BASE_PATH is injected by CI; defaults to "/" for local dev.
export default defineConfig({
  root: "app",
  base: process.env.BASE_PATH ?? "/",
  build: {
    outDir: "../site",
    emptyOutDir: true,
  },
  optimizeDeps: {
    exclude: ["sql.js"],
  },
});
