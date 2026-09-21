import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { handleTtsProxyRequest } from './src/core/audio/ttsProxyHandler';

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
        const method = req.method || 'GET';
        const headers = req.headers as Record<string, string | undefined>;
        const chunks: Buffer[] = [];

        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', async () => {
          const raw = Buffer.concat(chunks).toString('utf8');

          const result = await handleTtsProxyRequest(
            {
              method,
              headers,
              body: raw || undefined,
              clientIp: req.socket?.remoteAddress ?? undefined,
            },
            { apiKey }
          );

          res.statusCode = result.status;
          for (const [name, value] of Object.entries(result.headers)) {
            res.setHeader(name, value);
          }
          res.end(result.body);
        });
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
      sourcemap: true,
    },
  };
});
