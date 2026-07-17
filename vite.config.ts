import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
export default defineConfig({plugins:[react(),VitePWA({registerType:'autoUpdate',manifest:{name:'コンパスウォーク運動・生活記録',short_name:'コンパスウォーク',display:'standalone',theme_color:'#176b5a',background_color:'#f7faf8'}})]})
