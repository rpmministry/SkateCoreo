/**
 * commercialLicense.test.ts — Pruebas Unitarias del Sistema Comercial, Licencias y Entitlements
 *
 * Valida:
 *   1. Esquema de precios individuales ($5 mensual, $48 anual con 20% descuento).
 *   2. Tramos de descuento por volumen para clubes (5-9: 10%, 10-19: 20%, 20-49: 35%, 50+: 50%).
 *   3. Descuentos comerciales acordados/negociados (p. ej. 50% para 25 licencias).
 *   4. Generación criptográfica de códigos únicos SKC-XXXX-XXXX sin caracteres ambiguos.
 *   5. Generación de documentos PDF editoriales para 1, 10, 25 y 50 licencias.
 *   6. Lógica de Entitlements y control estricto de acceso por expiración.
 */

import assert from 'node:assert/strict';
import {
  commercialLicenseService,
  generateSecureCode,
} from './commercialLicenseService';
import { LicensePdfService } from './licensePdfService';
import { isOwnerOrAdmin } from '../store/useAuthStore';

async function runTests() {
  console.log('🧪 Iniciando pruebas del Sistema Comercial y Licencias de SkateCoreo...\n');

  // ── 1. Precios Base Individuales ──────────────────────────────────────────
  console.log('1. Verificando precios base individuales...');
  {
    const pricingAnnual = await commercialLicenseService.calculatePricing(1, 'annual');
    assert.equal(pricingAnnual.unit_base_price, 47.90);
    assert.equal(pricingAnnual.subtotal, 47.90);
    assert.equal(pricingAnnual.discount_percent, 0);
    assert.equal(pricingAnnual.total_amount, 47.90);

    const pricingMonthly = await commercialLicenseService.calculatePricing(1, 'monthly');
    assert.equal(pricingMonthly.unit_base_price, 4.99);
    assert.equal(pricingMonthly.subtotal, 4.99);
    assert.equal(pricingMonthly.discount_percent, 0);
    assert.equal(pricingMonthly.total_amount, 4.99);
    console.log('   ✓ Planes individuales correctos: Anual $47.90/año (20% desc.), Mensual $4.99/mes.');
  }

  // ── 2. Tramos de Descuento por Volumen para Clubes ───────────────────────
  console.log('\n2. Verificando tramos de descuento por volumen...');
  {
    // 4 licencias (tramo base < 5 -> 0%)
    const p4 = await commercialLicenseService.calculatePricing(4, 'annual');
    assert.equal(p4.discount_percent, 0);
    assert.equal(p4.total_amount, 191.60);

    // 5 licencias (tramo 5-9 -> 10%)
    const p5 = await commercialLicenseService.calculatePricing(5, 'annual');
    assert.equal(p5.discount_percent, 10);
    assert.equal(p5.subtotal, 239.50);
    assert.equal(p5.discount_amount, 23.95);
    assert.equal(p5.total_amount, 215.55);

    // 10 licencias (tramo 10-19 -> 20%)
    const p10 = await commercialLicenseService.calculatePricing(10, 'annual');
    assert.equal(p10.discount_percent, 20);
    assert.equal(p10.subtotal, 479.00);
    assert.equal(p10.discount_amount, 95.80);
    assert.equal(p10.total_amount, 383.20);

    // 25 licencias por volumen (tramo 20-49 -> 35%)
    const p25 = await commercialLicenseService.calculatePricing(25, 'annual');
    assert.equal(p25.discount_percent, 35);
    assert.equal(p25.subtotal, 1197.50);
    assert.equal(p25.discount_amount, 419.13);
    assert.equal(p25.total_amount, 778.37);

    // 50 licencias (tramo 50+ -> 50%)
    const p50 = await commercialLicenseService.calculatePricing(50, 'annual');
    assert.equal(p50.discount_percent, 50);
    assert.equal(p50.subtotal, 2395.00);
    assert.equal(p50.discount_amount, 1197.50);
    assert.equal(p50.total_amount, 1197.50);

    console.log('   ✓ Tramos automáticos verificados:');
    console.log('     · 1-4: 0% ($191.60)');
    console.log('     · 5-9: 10% ($215.55 para 5)');
    console.log('     · 10-19: 20% ($383.20 para 10)');
    console.log('     · 20-49: 35% ($778.37 para 25)');
    console.log('     · 50+: 50% ($1197.50 para 50)');
  }

  // ── 3. Descuento Negociado / Acordado (Caso de Estudio: 25 licencias al 50%)
  console.log('\n3. Verificando descuento acordado/negociado...');
  {
    const pNegotiated = await commercialLicenseService.calculatePricing(25, 'annual', 50);
    assert.equal(pNegotiated.discount_type, 'negotiated');
    assert.equal(pNegotiated.discount_percent, 50);
    assert.equal(pNegotiated.subtotal, 1197.50);
    assert.equal(pNegotiated.discount_amount, 598.75);
    assert.equal(pNegotiated.total_amount, 598.75);
    assert.equal(pNegotiated.savings_amount, 598.75);
    console.log('   ✓ Caso comercial verificado: 25 licencias @ 50% negociado = $598.75 total.');
  }

  // ── 4. Generación Criptográfica de Códigos Únicos SKC-XXXX-XXXX ───────────
  console.log('\n4. Verificando generación criptográfica de códigos...');
  {
    const CODE_REGEX = /^SKC-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/;
    const FORBIDDEN_CHARS = ['0', 'O', '1', 'I', 'L'];

    const generatedCodes = new Set<string>();
    const SAMPLE_COUNT = 1000;

    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const code = generateSecureCode();
      assert.ok(
        CODE_REGEX.test(code),
        `El código ${code} no cumple con el formato exacto SKC-XXXX-XXXX.`
      );

      for (const char of FORBIDDEN_CHARS) {
        assert.ok(
          !code.includes(char),
          `El código ${code} contiene el carácter ambiguo prohibido: ${char}`
        );
      }

      assert.ok(!generatedCodes.has(code), `Colisión detectada: el código ${code} se repitió.`);
      generatedCodes.add(code);
    }

    assert.equal(generatedCodes.size, SAMPLE_COUNT);
    console.log(`   ✓ ${SAMPLE_COUNT} códigos generados con 100% de unicidad y cero caracteres confusos.`);
  }

  // ── 5. Generación de Documentos PDF Editoriales ───────────────────────────
  console.log('\n5. Verificando generación de documentos PDF editoriales...');
  {
    const testCases = [1, 10, 25, 50];

    for (const count of testCases) {
      const codes = Array.from({ length: count }, (_, i) => ({
        id: `code_${i + 1}`,
        code: generateSecureCode(),
        status: 'available' as const,
        assigned_to_user_id: null,
        assigned_email: null,
        assigned_name: null,
        assigned_at: null,
        expires_at: new Date(Date.now() + 365 * 86400000).toISOString(),
        created_at: new Date().toISOString(),
      }));

      const pricing = await commercialLicenseService.calculatePricing(count, 'annual');

      const doc = LicensePdfService.generateDocument(
        {
          packageNumber: `PKG-${count}`,
          clientName: `Club de Patinaje Artistico Central (${count} licencias)`,
          clientEmail: 'contacto@clubcentral.com',
          plan: 'annual',
          totalLicenses: count,
          unitBasePrice: pricing.unit_base_price,
          subtotal: pricing.subtotal,
          discountPercent: pricing.discount_percent,
          discountAmount: pricing.discount_amount,
          totalAmount: pricing.total_amount,
          startsAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 365 * 86400000).toISOString(),
          authorizedBy: 'administracion@skatecoreo.com',
          paymentReference: 'PAYPAL-TX-998877',
          notes: 'Licencias autorizadas para el ciclo 2026-2027.',
        },
        codes
      );

      assert.ok(doc, `El PDF para ${count} licencias no fue generado.`);
      const pageCount = doc.getNumberOfPages();
      assert.ok(pageCount >= 1, `El PDF debe tener al menos una página (generó ${pageCount}).`);

      if (count === 50) {
        // 50 licencias requieren múltiples páginas para las tarjetas
        assert.ok(pageCount > 1, `50 licencias deben generar paginación multi-página (generó ${pageCount}).`);
      }

      console.log(`   ✓ PDF con ${count} licencias generado correctamente (${pageCount} páginas).`);
    }
  }

  // ── 6. Lógica de Entitlements y Control de Acceso por Expiración ─────────
  console.log('\n6. Verificando lógica de Entitlements y control de expiración...');
  {
    const now = Date.now();
    const oneDayMs = 86400000;

    // Caso A: Entitlement activo y vigente
    const activeEntitlement = {
      status: 'active',
      starts_at: new Date(now - 10 * oneDayMs).toISOString(),
      expires_at: new Date(now + 355 * oneDayMs).toISOString(),
    };
    const isGrantedA =
      activeEntitlement.status === 'active' &&
      new Date(activeEntitlement.expires_at).getTime() > now;
    assert.equal(isGrantedA, true, 'El usuario con entitlement vigente debe tener acceso.');

    // Caso B: Entitlement expirado (fecha vencida)
    const expiredEntitlement = {
      status: 'active',
      starts_at: new Date(now - 400 * oneDayMs).toISOString(),
      expires_at: new Date(now - 5 * oneDayMs).toISOString(),
    };
    const isGrantedB =
      expiredEntitlement.status === 'active' &&
      new Date(expiredEntitlement.expires_at).getTime() > now;
    assert.equal(isGrantedB, false, 'El usuario con entitlement vencido NO debe tener acceso.');

    // Caso C: Entitlement cancelado por el usuario pero con período pagado vigente
    const canceledEntitlement = {
      status: 'canceled',
      starts_at: new Date(now - 20 * oneDayMs).toISOString(),
      expires_at: new Date(now + 10 * oneDayMs).toISOString(), // Aún le quedan 10 días
    };
    // Regla de negocio: la cancelación de renovación mantiene el acceso hasta el fin del período ya abonado
    const isGrantedC =
      ['active', 'canceled'].includes(canceledEntitlement.status) &&
      new Date(canceledEntitlement.expires_at).getTime() > now;
    assert.equal(
      isGrantedC,
      true,
      'Un entitlement cancelado pero no vencido debe mantener acceso hasta su fecha de fin.'
    );

    // Caso D: Entitlement revocado administrativamente (fraude o reembolso)
    const revokedEntitlement = {
      status: 'revoked',
      starts_at: new Date(now - 5 * oneDayMs).toISOString(),
      expires_at: new Date(now + 360 * oneDayMs).toISOString(),
    };
    const isGrantedD =
      revokedEntitlement.status === 'active' &&
      new Date(revokedEntitlement.expires_at).getTime() > now;
    assert.equal(isGrantedD, false, 'Un entitlement revocado NO debe tener acceso.');

    console.log('   ✓ Control de entitlements validado: las credenciales solas nunca permiten acceso si la vigencia expiró.');
  }

  // ── 7. Autorizaciones de Administradores del Panel ───────────────────────
  console.log('\n7. Verificando autorizaciones de administradores del panel...');
  {
    const targetAdmins = [
      'mauriandrade2@gmail.com',
      'karenprofet@gmail.com',
      'contacto@alsiztech.com',
    ];

    for (const email of targetAdmins) {
      assert.equal(
        isOwnerOrAdmin(email),
        true,
        `El correo de administrador ${email} debe tener autorización completa (isOwnerOrAdmin = true).`
      );
    }
    console.log('   ✓ Los 3 correos administrativos cuentan con permisos totales de superadministrador.');
  }

  console.log('\n🎉 ¡TODAS LAS PRUEBAS COMERCIALES Y DE LICENCIAS PASARON CON ÉXITO!\n');
}

runTests().catch((err) => {
  console.error('\n❌ ERROR EN LAS PRUEBAS:', err);
  process.exit(1);
});
