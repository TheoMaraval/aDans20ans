import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/** CSP stricte injectée au build uniquement (le dev de Vite a besoin de scripts inline). */
function csp(): Plugin {
  return {
    name: 'csp', apply: 'build',
    transformIndexHtml(html) {
      const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
        .map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`).join(' ');
      const policy = [
        "default-src 'self'", `script-src 'self' ${hashes}`, "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:", "font-src 'self'", "connect-src 'self' https://api.github.com https://api.coingecko.com",
        "worker-src 'self'", "manifest-src 'self'", "base-uri 'self'", "form-action 'none'", "object-src 'none'",
      ].join('; ');
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
    },
  };
}

/** En dev : sert ./data/*.enc sous /data/. */
function devData(): Plugin {
  return {
    name: 'dev-data', apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = req.url?.match(/^\/data\/([\w.-]+\.enc)/);
        if (!m) return next();
        const p = resolve('data', m[1]);
        if (!existsSync(p)) { res.statusCode = 404; return res.end(); }
        res.setHeader('Content-Type', 'application/json');
        res.end(readFileSync(p));
      });
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  // Les pages sont embarquées dans le bundle principal (voir App.tsx) : ~230 Ko gzip, mis en cache par la PWA.
  build: { chunkSizeWarningLimit: 1000 },
  plugins: [
    react(), csp(), devData(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Patrimoine', short_name: 'Patrimoine', lang: 'fr',
        description: 'Suivi de patrimoine personnel chiffré',
        theme_color: '#0b1020', background_color: '#0b1020', display: 'standalone', start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png}'], navigateFallbackDenylist: [/\/data\//] },
    }),
  ],
});
