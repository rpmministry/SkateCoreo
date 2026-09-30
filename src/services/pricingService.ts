/**
 * pricingService.ts — Fuente Única y Centralizada de Verdad para Planes y Precios de SkateCoreo
 *
 * Precios oficiales vigentes:
 *   - Patinadora / Patinador:
 *       • Mensual: $5.00 USD/mes
 *       • Anual: $48.00 USD/año (20% descuento, ahorras $12.00/año, equivalente a $4.00/mes)
 *   - Entrenador / Entrenadora:
 *       • Mensual: $8.00 USD/mes
 *       • Anual: $67.20 USD/año (30% descuento, ahorras $28.80/año, equivalente a $5.60/mes)
 */

export type PlanPeriod = 'monthly' | 'annual';
export type PlanRole = 'skater' | 'coach';

export interface PricingPlan {
  role: PlanRole;
  name: string;
  shortName: string;
  tagline: string;
  badge?: string;
  monthlyPrice: number;
  annualPrice: number;
  annualDiscountPercent: number;
  monthlyEquivalent: number;
  annualSavings: number;
  baseAnnualPrice: number; // 12 * monthlyPrice
  features: string[];
  highlight?: string;
}

export const SKATER_PLAN: PricingPlan = {
  role: 'skater',
  name: 'Plan Patinadora / Patinador',
  shortName: 'Patinador(a)',
  tagline: 'Acceso completo al diseño coreográfico individual y sincronización musical',
  monthlyPrice: 5.0,
  annualPrice: 48.0,
  baseAnnualPrice: 60.0,
  annualDiscountPercent: 20,
  monthlyEquivalent: 4.0,
  annualSavings: 12.0,
  features: [
    'Pista 2D con trazado cinemático y curvas Bézier',
    'Estudio de Audio con sincronización musical y BPM',
    'Catálogo reglamentario oficial y cálculo de valor base (BV)',
    'Exportación e importación de coreografías (.coreo)',
    'Modo Entrenamiento 100% Offline (sin red en la pista)',
    'Hasta 3 dispositivos: 1 PC + 1 Tablet + 1 Celular',
  ],
};

export const COACH_PLAN: PricingPlan = {
  role: 'coach',
  name: 'Plan Entrenador',
  shortName: 'Entrenador(a)',
  tagline: 'Ecosistema profesional de gestión de atletas, evaluaciones oficiales y nube',
  badge: 'Recomendado para Entrenadores',
  monthlyPrice: 8.0,
  annualPrice: 67.2,
  baseAnnualPrice: 96.0,
  annualDiscountPercent: 30,
  monthlyEquivalent: 5.6,
  annualSavings: 28.8,
  highlight: 'Ahorras $28.80/año con el 30% de descuento anual',
  features: [
    'Todo lo incluido en el Plan Patinadora/Patinador',
    'Panel de Entrenador profesional desacoplado y local-first',
    'Panel Técnico de Evaluación Oficial (RollArt, FEP y White)',
    'Ficha y expediente deportivo digital por cada atleta',
    'Historial cronológico de evolución y comparador técnico',
    'Actas editoriales de evaluación en PDF A4 listas para imprimir',
    'Conexión en 1-clic con Google Drive, OneDrive y Dropbox',
    'Exportación de rutinas con evaluaciones integradas en .coreo',
    'Hasta 3 dispositivos: 1 PC + 1 Tablet + 1 Celular',
  ],
};

export const PRICING_PLANS: Record<PlanRole, PricingPlan> = {
  skater: SKATER_PLAN,
  coach: COACH_PLAN,
};

export const SKATECOREO_PLANS = PRICING_PLANS;

export interface VolumeDiscountTier {
  minLicenses: number;
  maxLicenses: number | null;
  discountPercent: number;
}

export const VOLUME_DISCOUNT_TIERS: VolumeDiscountTier[] = [
  { minLicenses: 5, maxLicenses: 9, discountPercent: 10 },
  { minLicenses: 10, maxLicenses: 19, discountPercent: 20 },
  { minLicenses: 20, maxLicenses: 49, discountPercent: 35 },
  { minLicenses: 50, maxLicenses: null, discountPercent: 50 },
];

export const getVolumeDiscountPercent = (totalLicenses: number): number => {
  for (const tier of VOLUME_DISCOUNT_TIERS) {
    if (totalLicenses >= tier.minLicenses && (tier.maxLicenses === null || totalLicenses <= tier.maxLicenses)) {
      return tier.discountPercent;
    }
  }
  return 0;
};

export const calculatePrice = (
  role: PlanRole,
  period: PlanPeriod,
  licenses = 1
): {
  unitPrice: number;
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  total: number;
  savings: number;
} => {
  const plan = PRICING_PLANS[role];
  const unitPrice = period === 'annual' ? plan.annualPrice : plan.monthlyPrice;
  const subtotal = Number((unitPrice * licenses).toFixed(2));
  const volumeDiscount = licenses > 1 ? getVolumeDiscountPercent(licenses) : 0;
  const discountAmount = Number(((subtotal * volumeDiscount) / 100).toFixed(2));
  const total = Number((subtotal - discountAmount).toFixed(2));
  const savings = period === 'annual' ? plan.annualSavings * licenses : 0;

  return {
    unitPrice,
    subtotal,
    discountPercent: volumeDiscount || (period === 'annual' ? plan.annualDiscountPercent : 0),
    discountAmount,
    total,
    savings,
  };
};

export const formatCurrency = (amount: number): string => {
  return `$${amount.toFixed(2)}`;
};

