import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import offlinePrecache from './offline-plugin.mjs';

const productionPolicy = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "connect-src 'self'",
  "img-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'dars-production-csp',
      apply: 'build',
      transformIndexHtml(html) {
        return html.replace(
          '<!-- production-csp -->',
          `<meta http-equiv="Content-Security-Policy" content="${productionPolicy}">`,
        );
      },
    },
    offlinePrecache(),
  ],
});
