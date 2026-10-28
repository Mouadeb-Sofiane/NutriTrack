/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// base './' : l'application fonctionne quel que soit le sous-dossier d'hébergement
// (GitHub Pages, réseau local…) car la navigation interne utilise le hash (#/…).
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'NutriTrack',
        short_name: 'NutriTrack',
        description: 'Suivi nutritionnel personnel, local et gratuit.',
        lang: 'fr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f6f8f5',
        theme_color: '#f6f8f5',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // Le modèle de reconnaissance (≈ 96 Mo) n'est téléchargé que sur demande (voir src/vision/modelStore.ts).
        globIgnores: ['models/**'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Moteur WebAssembly d'ONNX Runtime : mis en cache au premier usage, puis disponible hors ligne.
            urlPattern: /\/assets\/ort-wasm[^/]*\.(wasm|mjs)$/,
            handler: 'CacheFirst',
            options: { cacheName: 'nutritrack-vision-runtime', expiration: { maxEntries: 6 } },
          },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
