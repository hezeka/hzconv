import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Строгая CSP только в сборке: dev-серверу Vite нужны inline-скрипты и websocket.
const csp = {
  name: 'hzconv-csp',
  apply: 'build',
  transformIndexHtml(html) {
    const policy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'";
    return html.replace('<head>', `<head>\n  <meta http-equiv="Content-Security-Policy" content="${policy}">`);
  }
};

export default defineConfig({
  plugins: [vue(), csp],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome114',
    chunkSizeWarningLimit: 800
  }
});
