import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Poker Tracker Multiplayer',
        short_name: 'Poker',
        description: 'Multiplayer Texas Hold\'em with friends',
        start_url: '/',
        display: 'standalone',
        background_color: '#1a0f0a',
        theme_color: '#f0c040',
        orientation: 'portrait',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: /\/socket\.io\//,
            handler: 'NetworkOnly'
          }
        ]
      }
    })
  ],
  server: {
    allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app'],
    proxy: {
      // This forwards all multiplayer data to your backend server
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true, // Enable WebSockets
      },
    },
  },
})
