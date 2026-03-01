import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: mode === "github" ? "/live-chat/" : "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.ico",
        "apple-touch-icon.png",
        "pwa-192.png",
        "pwa-512.png",
      ],
      manifest: {
        name: "Personal Hub: Live",
        short_name: "PHiL CRM",
        description: "Staff rota + live chat CRM",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        scope: "./",
        start_url: "./rota",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
});