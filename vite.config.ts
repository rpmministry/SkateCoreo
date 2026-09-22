import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
// Se importa EXACTAMENTE el mismo archivo que despliega Vercel, de modo que el
// middleware de desarrollo y la función en producción no puedan divergir.
import { handleTtsProxyRequest, readNodeRequestBody } from './api/tts';

/**
 * Middleware de desarrollo: expone `POST /api/tts` dentro del dev server de Vite
 * usando EXACTAMENTE el mismo núcleo que la función serverless de Vercel.
 *
 * Así `npm run dev` tiene paridad con producción: voz natural sin exponer la
 * credencial en el bundle del cliente ni obligar a usar `vercel dev`.
 */
function ttsDevApi(apiKey: string | null): Plugin {
  return {
    name: 'skatecoreo-tts-dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/tts', (req, res) => {
        void (async () => {
          const method = (req.method || 'GET').toUpperCase();
          const headers = req.headers as Record<string, string | undefined>;

          // Mismo lector endurecido que usa la función de Vercel (nunca cuelga).
          let body: unknown;
          if (method === 'POST') {
            const raw = await readNodeRequestBody(req);
            body = raw || undefined;
          }

          const result = await handleTtsProxyRequest(
            {
              method,
              headers,
              body,
              clientIp: req.socket?.remoteAddress ?? undefined,
            },
            { apiKey }
          );

          res.statusCode = result.status;
          for (const [name, value] of Object.entries(result.headers)) {
            res.setHeader(name, value);
          }
          res.end(result.body as Uint8Array | string);
        })();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // `''` como tercer argumento carga TODAS las variables, incluidas las que no
  // llevan el prefijo VITE_ (la credencial del servidor no debe exponerse).
  const env = loadEnv(mode, process.cwd(), '');
  const serverApiKey =
    (env.GOOGLE_TTS_API_KEY || env.VITE_GOOGLE_TTS_API_KEY || '').trim() || null;

  return {
    plugins: [react(), ttsDevApi(serverApiKey)],
    base: './',
    server: {
      port: 3000,
      host: true,
    },
    build: {
      target: 'es2020',
      outDir: 'dist',
      assetsDir: 'assets',
      // Sourcemaps SOLO fuera de producción: en prod añadían ~4.9 MB al artefacto
      // y exponían el código fuente, retrasando la descarga inicial de la PWA.
      sourcemap: mode !== 'production',
      // Los chunks pesados (jspdf, supabase…) son lazy; se eleva el aviso para no
      // inundar la salida de warnings con módulos que se cargan bajo demanda.
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          /**
           * División de vendors en chunks cacheables e independientes del código
           * de la app. Así, al desplegar una nueva versión, el navegador reutiliza
           * React/Supabase/i18n/lucide de la caché en lugar de re-descargar un
           * único bundle monolítico.
           */
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            const norm = id.replace(/\\/g, '/');
            if (/node_modules\/(react|react-dom|scheduler)\//.test(norm)) return 'vendor-react';
            if (norm.includes('@supabase')) return 'vendor-supabase';
            if (norm.includes('i18next')) return 'vendor-i18n';
            if (norm.includes('@use-gesture')) return 'vendor-gesture';
            if (norm.includes('lucide-react')) return 'vendor-icons';
            if (norm.includes('jspdf') || norm.includes('html2canvas') || norm.includes('purify')) return 'vendor-pdf';
            if (norm.includes('jszip')) return 'vendor-zip';
            return undefined;
          },
        },
      },
    },
  };
});
