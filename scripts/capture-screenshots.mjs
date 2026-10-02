/**
 * capture-screenshots.mjs — Captura Automatizada Multi-dispositivo y Multi-resolución
 *
 * Utiliza Playwright para generar capturas reales de alta fidelidad (Retina 2x)
 * cubriendo Desktop, Tablet Landscape, Tablet Portrait, Móvil iPhone y Móvil Android.
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SCREENSHOTS_DIR = path.resolve('screenshots');
const BASE_URL = process.env.APP_URL || 'https://skate-coreo.vercel.app/';

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// Configuración de Sesión Autenticada de Administrador/Entrenador
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

async function captureAll() {
  console.log(`🚀 Iniciando captura automatizada en: ${BASE_URL}`);
  const browser = await chromium.launch({ headless: true });

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // 1. DESKTOP (1920x1080, Retina 2x)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n🖥️  [1/5] Capturando Vistas de Escritorio (1920x1080)...');
    const desktopContext = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2
    });

    const page = await desktopContext.newPage();
    await page.addInitScript((session) => {
      localStorage.setItem('skatecoreo_saas_auth_session', JSON.stringify(session));
    }, AUTH_SESSION);

    // 1.1 Home View Desktop
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_home_desktop.png') });
    console.log('  ✓ 01_home_desktop.png');

    // 1.2 Pista 2D Canvas Desktop
    const btnRink = page.locator('text=Abrir Pista 2D');
    if (await btnRink.count() > 0) {
      await btnRink.first().click();
      await page.waitForTimeout(1200);
    }
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04_rink_2d_desktop.png') });
    console.log('  ✓ 04_rink_2d_desktop.png');

    // 1.3 Pista 2D con colocación de nodos e inspector
    const canvas = page.locator('canvas').first();
    if (await canvas.count() > 0) {
      const box = await canvas.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.4);
        await page.waitForTimeout(400);
        await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.6);
        await page.waitForTimeout(400);
        await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.35);
        await page.waitForTimeout(600);
      }
    }
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05_rink_2d_with_nodes_desktop.png') });
    console.log('  ✓ 05_rink_2d_with_nodes_desktop.png');

    // 1.4 Menú de Exportación y Opciones de Proyecto
    const btnMore = page.locator('button[aria-label="Más opciones del proyecto"]');
    if (await btnMore.count() > 0) {
      await btnMore.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '17_export_options_menu.png') });
      console.log('  ✓ 17_export_options_menu.png');
      await page.mouse.click(10, 10);
      await page.waitForTimeout(300);
    }

    // 1.5 Audio Studio DAW Desktop
    const navStudio = page.locator('button:has-text("Estudio"), button:has-text("Audio Studio")');
    if (await navStudio.count() > 0) {
      await navStudio.first().click();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '09_audio_studio_daw_desktop.png') });
      console.log('  ✓ 09_audio_studio_daw_desktop.png');
    }

    // 1.6 Panel del Entrenador - Dashboard
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const navCoachDesktop = page.locator('button:has-text("Entrenador"), button:has-text("Panel del Entrenador")');
    if (await navCoachDesktop.count() > 0) {
      await navCoachDesktop.first().click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '12_coach_portal_dashboard_desktop.png') });
      console.log('  ✓ 12_coach_portal_dashboard_desktop.png');

      // 1.7 Panel del Entrenador - Mis Atletas
      const tabAthletes = page.locator('nav:visible button:has-text("Mis Atletas")');
      if (await tabAthletes.count() > 0) {
        await tabAthletes.first().click();
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '13_coach_portal_athletes_desktop.png') });
        console.log('  ✓ 13_coach_portal_athletes_desktop.png');
      }

      // 1.8 Panel del Entrenador - Panel Técnico RollArt 2026
      const tabTechnical = page.locator('nav:visible button:has-text("Panel Técnico")');
      if (await tabTechnical.count() > 0) {
        await tabTechnical.first().click();
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '14_coach_portal_technical_panel_desktop.png') });
        console.log('  ✓ 14_coach_portal_technical_panel_desktop.png');
      }
    }

    // 1.9 Paper-to-Digital Modal
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const btnPaper = page.locator('button:has-text("Digitalizar plantilla A4")');
    if (await btnPaper.count() > 0) {
      await btnPaper.click();
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '16_paper_to_digital_modal_desktop.png') });
      console.log('  ✓ 16_paper_to_digital_modal_desktop.png');
      const closeBtn = page.locator('button:has-text("✕"), button[aria-label="Cerrar"]');
      if (await closeBtn.count() > 0) await closeBtn.first().click();
    }

    // 1.10 Skaters Manager Modal
    const btnSkaters = page.locator('button:has-text("Atletas")');
    if (await btnSkaters.count() > 0) {
      await btnSkaters.first().click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '18_skaters_manager_modal.png') });
      console.log('  ✓ 18_skaters_manager_modal.png');
    }

    await desktopContext.close();

    // ═══════════════════════════════════════════════════════════════════════
    // 2. TABLET LANDSCAPE (iPad Pro 11 Landscape: 1194x834)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📱 [2/5] Capturando Tablet Landscape (1194x834)...');
    const tabletLandContext = await browser.newContext({
      viewport: { width: 1194, height: 834 },
      deviceScaleFactor: 2
    });
    const tabletLandPage = await tabletLandContext.newPage();
    await tabletLandPage.addInitScript((session) => {
      localStorage.setItem('skatecoreo_saas_auth_session', JSON.stringify(session));
    }, AUTH_SESSION);

    await tabletLandPage.goto(BASE_URL, { waitUntil: 'networkidle' });
    await tabletLandPage.waitForTimeout(800);
    const btnRinkTabLand = tabletLandPage.locator('text=Abrir Pista 2D');
    if (await btnRinkTabLand.count() > 0) {
      await btnRinkTabLand.first().click();
      await tabletLandPage.waitForTimeout(1000);
      await tabletLandPage.screenshot({ path: path.join(SCREENSHOTS_DIR, '07_rink_2d_tablet_landscape.png') });
      console.log('  ✓ 07_rink_2d_tablet_landscape.png');
    }
    await tabletLandContext.close();

    // ═══════════════════════════════════════════════════════════════════════
    // 3. TABLET PORTRAIT (iPad 810x1080)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📱 [3/5] Capturando Tablet Portrait (810x1080)...');
    const tabletPortContext = await browser.newContext({
      viewport: { width: 810, height: 1080 },
      deviceScaleFactor: 2
    });
    const tabletPortPage = await tabletPortContext.newPage();
    await tabletPortPage.addInitScript((session) => {
      localStorage.setItem('skatecoreo_saas_auth_session', JSON.stringify(session));
    }, AUTH_SESSION);

    await tabletPortPage.goto(BASE_URL, { waitUntil: 'networkidle' });
    await tabletPortPage.waitForTimeout(800);
    await tabletPortPage.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_home_tablet_portrait.png') });
    console.log('  ✓ 02_home_tablet_portrait.png');

    const btnStudioTabPort = tabletPortPage.locator('text=Editar en Estudio');
    if (await btnStudioTabPort.count() > 0) {
      await btnStudioTabPort.first().click();
      await tabletPortPage.waitForTimeout(1000);
      await tabletPortPage.screenshot({ path: path.join(SCREENSHOTS_DIR, '10_audio_studio_daw_tablet.png') });
      console.log('  ✓ 10_audio_studio_daw_tablet.png');
    }
    await tabletPortContext.close();

    // ═══════════════════════════════════════════════════════════════════════
    // 4. MÓVIL IPHONE (iPhone 14/15/16: 393x852)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📲 [4/5] Capturando Móvil iPhone (393x852)...');
    const iPhoneContext = await browser.newContext({
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true
    });
    const iPhonePage = await iPhoneContext.newPage();
    await iPhonePage.addInitScript((session) => {
      localStorage.setItem('skatecoreo_saas_auth_session', JSON.stringify(session));
    }, AUTH_SESSION);

    await iPhonePage.goto(BASE_URL, { waitUntil: 'networkidle' });
    await iPhonePage.waitForTimeout(800);
    await iPhonePage.screenshot({ path: path.join(SCREENSHOTS_DIR, '03_home_mobile_iphone.png') });
    console.log('  ✓ 03_home_mobile_iphone.png');

    const btnRinkiPhone = iPhonePage.locator('text=Abrir Pista 2D');
    if (await btnRinkiPhone.count() > 0) {
      await btnRinkiPhone.first().click();
      await iPhonePage.waitForTimeout(1000);
      await iPhonePage.screenshot({ path: path.join(SCREENSHOTS_DIR, '08_rink_2d_mobile_portrait.png') });
      console.log('  ✓ 08_rink_2d_mobile_portrait.png');
    }
    await iPhoneContext.close();

    // ═══════════════════════════════════════════════════════════════════════
    // 5. MÓVIL ANDROID (Pixel 7: 412x915)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📲 [5/5] Capturando Móvil Android (412x915)...');
    const androidContext = await browser.newContext({
      viewport: { width: 412, height: 915 },
      deviceScaleFactor: 2.6,
      isMobile: true,
      hasTouch: true
    });
    const androidPage = await androidContext.newPage();
    await androidPage.addInitScript((session) => {
      localStorage.setItem('skatecoreo_saas_auth_session', JSON.stringify(session));
    }, AUTH_SESSION);

    await androidPage.goto(BASE_URL, { waitUntil: 'networkidle' });
    await androidPage.waitForTimeout(800);

    const btnStudioAndroid = androidPage.locator('text=Editar en Estudio');
    if (await btnStudioAndroid.count() > 0) {
      await btnStudioAndroid.first().click();
      await androidPage.waitForTimeout(1000);
      await androidPage.screenshot({ path: path.join(SCREENSHOTS_DIR, '11_audio_studio_daw_mobile.png') });
      console.log('  ✓ 11_audio_studio_daw_mobile.png');
    }

    // Ir a Panel del Entrenador desde móvil
    await androidPage.goto(BASE_URL, { waitUntil: 'networkidle' });
    await androidPage.waitForTimeout(600);
    const btnCoachAndroid = androidPage.locator('text=Abrir Panel del Entrenador');
    if (await btnCoachAndroid.count() > 0) {
      await btnCoachAndroid.first().click();
      await androidPage.waitForTimeout(1000);
      const tabTechMobile = androidPage.locator('button:has-text("Panel Técnico"):visible');
      if (await tabTechMobile.count() > 0) {
        await tabTechMobile.first().click();
        await androidPage.waitForTimeout(800);
        await androidPage.screenshot({ path: path.join(SCREENSHOTS_DIR, '15_coach_portal_technical_panel_mobile.png') });
        console.log('  ✓ 15_coach_portal_technical_panel_mobile.png');
      }
    }
    await androidContext.close();

    console.log('\n🎉 ¡Todas las capturas se generaron con éxito en /screenshots!');
  } finally {
    await browser.close();
  }
}

captureAll().catch((err) => {
  console.error('❌ Error capturando pantallas:', err);
  process.exit(1);
});
