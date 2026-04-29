import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // This forwards all multiplayer data to your backend server
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true, // Enable WebSockets
      },
    },
  },
})
