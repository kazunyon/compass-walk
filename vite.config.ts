import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/',

  plugins: [
    react(),

    VitePWA({
      registerType: 'prompt',
      injectRegister: false,

      includeAssets: ['app-icon.svg'],

      manifest: {
        name: 'コンパスウォーク 運動・生活記録',
        short_name: 'コンパスウォーク',
        description: '運動・生活記録をオフラインでも確認・記録できるアプリです。',
        lang: 'ja',

        start_url: '/',
        scope: '/',

        display: 'standalone',
        theme_color: '#176b5a',
        background_color: '#f7faf8',

        icons: [
          {
            src: 'app-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },

      workbox: {
        navigateFallback: 'index.html',
        globPatterns: [
          '**/*.{js,css,html,ico,png,svg,webmanifest}',
        ],
      },
    }),
  ],
})