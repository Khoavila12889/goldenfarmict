import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Override được bằng biến môi trường (xem .env_docker):
//   VITE_DEV_API_TARGET       — backend FastAPI     (mặc định http://127.0.0.1:8000)
//   VITE_DEV_ONLYOFFICE_TARGET— nginx của container frontend (mặc định http://127.0.0.1:8088)
//
// /onlyoffice KHÔNG proxy thẳng tới Document Server: chỉ nginx của frontend
// (frontend/nginx.conf) mới gửi đúng X-Forwarded-Prefix + Host có port, thứ mà
// DS cần để sinh URL redirect `/onlyoffice/<version>/web-apps/...`. Proxy thẳng
// tới DS sẽ thiếu prefix và dev/prod sẽ chạy hai cấu hình khác nhau.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_DEV_API_TARGET || 'http://127.0.0.1:8000'
  const onlyofficeTarget = env.VITE_DEV_ONLYOFFICE_TARGET || 'http://127.0.0.1:8088'

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          ws: true,
          timeout: 0,
          proxyTimeout: 0,
        },
        '/onlyoffice': {
          target: onlyofficeTarget,
          // Giữ nguyên Host (localhost:5173) để DS sinh redirect về đúng cổng
          // của Vite, iframe editor vẫn same-origin.
          changeOrigin: false,
          ws: true,
          timeout: 0,
          proxyTimeout: 0,
        },
      },
    },
  }
})
