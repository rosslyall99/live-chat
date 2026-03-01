import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
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
        "screenshots/mobile-1.png",
        "screenshots/wide-1.png",
      ],
      manifest: {
        name: "Personal Hub: Live",
        short_name: "PHiL CRM",
        description: "Staff rota + live chat CRM",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        id: "./rota",
        start_url: "./rota",
        scope: "./",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
        ],
        screenshots: [
          {
            src: "screenshots/mobile-1.png",
            sizes: "1080x1920",
            type: "image/png"
            // no form_factor => counts as mobile
          },
          {
            src: "screenshots/wide-1.png",
            sizes: "1920x1080",
            type: "image/png",
            form_factor: "wide",
          },
        ],
      },
    }),
  ],
}));