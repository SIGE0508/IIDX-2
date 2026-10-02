import { defineConfig } from "vite";

/**
 * GitHub Pages serves this project below /IIDX-2/. Local Vite development
 * intentionally keeps the root path so existing localhost URLs keep working.
 */
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/IIDX-2/" : "/",
});
