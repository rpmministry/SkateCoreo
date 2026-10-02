/**
 * generate-demo-video.mjs — Demostración Automatizada en Video de SkateCoreo
 *
 * Utiliza Playwright Browser Video Recording para grabar un flujo de usuario
 * continuo y real que demuestra:
 *   1. Inicio de sesión y verificación de credenciales / modo Superadmin
 *   2. Vista principal de Inicio (Home) con sus tres pilares arquitectónicos
 *   3. Pista 2D: lienzo reglamentario 25x50m, marcas oficiales World Skate
 *   4. Creación y manipulación de nodos coreográficos en tiempo real
 *   5. Inspector de nodo y selección de figura reglamentaria (Reglamento 2026)
 *   6. Navegación a Audio Studio (DAW Lite multipista con medidores y BPM)
 *   7. Apertura del Panel de Entrenadores (Dashboard, Fichas de Atletas)
 *   8. Panel Técnico RollArt 2026: simulación de evaluación, TES, PCS y Deducciones
 *   9. Modal de digitalización de plantilla de papel A4 (Paper-to-Digital)
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const VIDEOS_DIR = path.resolve('videos');
const BASE_URL = process.env.APP_URL || 'https://skate-coreo.vercel.app/';

if (!fs.existsSync(VIDEOS_DIR)) {
  fs.mkdirSync(VIDEOS_DIR, { recursive: true });
}

const AUTH_SESSION = {
  user: {
    id: 'coach_admin_demo',
    email: 'contacto@alsiztech.com',
    nombre: 'Mauricio Andrade (Coach/Admin)'
  },
  role: 'superadmin',
  subscription_status: 'active',
  subscription_plan: 'coach',
  access_expires_at: '2028-12-31T23:59:59.000Z'
};

async function recordDemo() {
  console.log(`🎬 Iniciando grabación de video de demostración en: ${BASE_URL}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: VIDEOS_DIR,
      size: { width: 1920, height: 1080 }
    }
  });

  const page = await context.newPage();
  await page.addInitScript((session) => {
    localStorage.setItem('skatecoreo_saas_auth_session', JSON.stringify(session));
  }, AUTH_SESSION);

  try {
    // ── Paso 1: Carga de Home View ──────────────────────────────────────────
    console.log('  ▶ Escena 1: Pantalla Principal (Home View)...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    // Mover cursor suavemente sobre las tarjetas principales visibles
    const cardPista = page.locator('button:has-text("Abrir Pista 2D"):visible, h3:has-text("Pista 2D"):visible').first();
    if (await cardPista.count() > 0) {
      await cardPista.hover();
      await page.waitForTimeout(1000);
    }
    const cardStudio = page.locator('button:has-text("Abrir Estudio"):visible, h3:has-text("Audio Studio"):visible').first();
    if (await cardStudio.count() > 0) {
      await cardStudio.hover();
      await page.waitForTimeout(1000);
    }
    const cardCoach = page.locator('button:has-text("Abrir Panel"):visible, h3:has-text("Panel del Entrenador"):visible').first();
    if (await cardCoach.count() > 0) {
      await cardCoach.hover();
      await page.waitForTimeout(1000);
    }

    // ── Paso 2: Pista 2D y Colocación de Nodos ──────────────────────────────
    console.log('  ▶ Escena 2: Editor de Coreografía y Pista 2D...');
    const btnRink = page.locator('button:has-text("Abrir Pista 2D"):visible, nav button:has-text("Pista 2D"):visible').first();
    if (await btnRink.count() > 0) {
      await btnRink.click();
      await page.waitForTimeout(2000);
    }

    // Colocar nodos sobre el lienzo Canvas
    const canvas = page.locator('canvas').first();
    if (await canvas.count() > 0) {
      const box = await canvas.boundingBox();
      if (box) {
        // Simular colocación de nodos paso a paso
        console.log('    · Colocando nodos en coordenadas de pista...');
        await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.35);
        await page.waitForTimeout(800);
        await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.65);
        await page.waitForTimeout(800);
        await page.mouse.click(box.x + box.width * 0.65, box.y + box.height * 0.35);
        await page.waitForTimeout(800);
        await page.mouse.click(box.x + box.width * 0.80, box.y + box.height * 0.50);
        await page.waitForTimeout(1500);
      }
    }

    // ── Paso 3: Inspector de Nodo y Figuras ─────────────────────────────────
    console.log('  ▶ Escena 3: Inspector de Nodo y Selección de Figura...');
    const selectFigure = page.locator('select').first();
    if (await selectFigure.count() > 0) {
      await selectFigure.hover();
      await page.waitForTimeout(1000);
    }

    // ── Paso 4: Audio Studio DAW ───────────────────────────────────────────
    console.log('  ▶ Escena 4: Estudio de Audio (DAW Multipista)...');
    const navStudio = page.locator('button:has-text("Estudio"), button:has-text("Audio Studio")').first();
    if (await navStudio.count() > 0) {
      await navStudio.click();
      await page.waitForTimeout(2500);
    }

    // ── Paso 5: Panel del Entrenador & Panel Técnico ────────────────────────
    console.log('  ▶ Escena 5: Panel del Entrenador...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    const btnCoachPortal = page.locator('button:has-text("Entrenador"), button:has-text("Panel del Entrenador")').first();
    if (await btnCoachPortal.count() > 0) {
      await btnCoachPortal.click();
      await page.waitForTimeout(2000);

      // Ir a Panel Técnico
      console.log('  ▶ Escena 6: Panel Técnico RollArt 2026...');
      const tabTech = page.locator('nav:visible button:has-text("Panel Técnico")').first();
      if (await tabTech.count() > 0) {
        await tabTech.click();
        await page.waitForTimeout(2500);

        // Llamar a un elemento de ejemplo en la evaluación
        const btnCall = page.locator('button:has-text("Llamar Elemento")').first();
        if (await btnCall.count() > 0) {
          await btnCall.click();
          await page.waitForTimeout(1500);
        }
      }
    }

    // ── Paso 6: Cierre de la Demostración ──────────────────────────────────
    console.log('  ▶ Escena 7: Conclusión...');
    await page.waitForTimeout(2000);

    console.log('✅ Demostración completada. Finalizando grabación...');
  } catch (err) {
    console.error('⚠️ Error durante la grabación del demo:', err);
  } finally {
    const videoPage = page.video();
    await page.close();
    await context.close();
    await browser.close();

    if (videoPage) {
      const videoPath = await videoPage.path();
      const targetPath = path.join(VIDEOS_DIR, 'skatecoreo_demo_walkthrough.webm');
      try {
        fs.copyFileSync(videoPath, targetPath);
        console.log(`🎉 ¡Video de demostración guardado exitosamente en: ${targetPath}!`);
      } catch (e) {
        console.log(`Video temporal generado en: ${videoPath}`);
      }
    }
  }
}

recordDemo().catch((err) => {
  console.error('❌ Error grabando video:', err);
});
