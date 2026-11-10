import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Self-signed HTTPS for the dev server. Browsers only allow camera/mic on
    // HTTPS (or localhost), so this is what lets other devices on the LAN
    // publish video. Accept the certificate warning once per device.
    basicSsl(),
  ],
  server: {
    // Listen on all interfaces so phones/laptops on the same network can connect.
    host: true,
  },
})
