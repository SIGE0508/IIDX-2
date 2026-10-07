import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * GitHub Pages serves this project below /IIDX-2/. Local Vite development
 * intentionally keeps the root path so existing localhost URLs keep working.
 */
const base = process.env.GITHUB_ACTIONS ? "/IIDX-2/" : "/";
export default defineConfig({
  base,
  plugins: [VitePWA({
    strategies: "generateSW",
    registerType: "prompt",
    injectRegister: false,
    devOptions: { enabled: false },
    manifest: {
      name: "IIDX CLEAR TRACKER", short_name: "CLEAR TRACKER",
      id: base, start_url: base, scope: base, display: "standalone", lang: "ja",
      theme_color: "#10151d", background_color: "#10151d",
      icons: [
        { src: `${base}icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: `${base}icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
        { src: `${base}icons/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    workbox: {
      cacheId: "iidx-clear-tracker",
      globPatterns: ["**/*.{html,js,css,json,png,webmanifest}"],
      maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      navigateFallback: `${base}index.html`,
      cleanupOutdatedCaches: true,
      skipWaiting: false,
      clientsClaim: false,
    },
  })],
});
