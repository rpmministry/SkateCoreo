/**
 * pricingService.ts — Fuente Única y Centralizada de Verdad para Planes y Precios de SkateCoreo
 *
 * Precios oficiales vigentes:
 *   - Patinadora / Patinador:
 *       • Mensual: $4.99 USD/mes
 *       • Anual: $47.90 USD/año (20% descuento, ahorras $11.98/año, equivalente a $3.99/mes)
 *   - Entrenador / Entrenadora:
 *       • Mensual: $9.99 USD/mes
 *       • Anual: $83.92 USD/año (30% descuento, ahorras $35.96/año, equivalente a $6.99/mes)
 */

export const APP_MODE: 'TESTER' | 'COMMERCIAL' = 'TESTER';

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
  monthlyPrice: 4.99,
  annualPrice: 47.90,
  baseAnnualPrice: 59.88,
  annualDiscountPercent: 20,
  monthlyEquivalent: 3.99,
  annualSavings: 11.98,
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
  monthlyPrice: 9.99,
  annualPrice: 83.92,
  baseAnnualPrice: 119.88,
  annualDiscountPercent: 30,
  monthlyEquivalent: 6.99,
  annualSavings: 35.96,
  highlight: 'Ahorras $35.96/año con el 30% de descuento anual',
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

export interface SubscriptionPlanDetails {
  role: PlanRole;
  period: PlanPeriod;
  planId: string;
  name: string;
  amount: number;
  currency: 'USD';
  description: string;
  durationDays: number;
  monthlyEquivalent: number;
  savings: number;
  discountPercent: number;
}

export const getPlanDetails = (role: PlanRole = 'skater', period: PlanPeriod = 'annual'): SubscriptionPlanDetails => {
  const plan = PRICING_PLANS[role] || SKATER_PLAN;
  const isMonthly = period === 'monthly';
  const amount = isMonthly ? plan.monthlyPrice : plan.annualPrice;
  const durationDays = isMonthly ? 30 : 365;
  const planId = `${role}_${period}`;
  const description = isMonthly
    ? `${plan.name} - Suscripción Mensual ($${amount.toFixed(2)} USD/mes)`
    : `${plan.name} - Suscripción Anual ($${amount.toFixed(2)} USD/año con ${plan.annualDiscountPercent}% descuento)`;
  const monthlyEquivalent = isMonthly ? plan.monthlyPrice : plan.monthlyEquivalent;
  const savings = isMonthly ? 0 : plan.annualSavings;
  const discountPercent = isMonthly ? 0 : plan.annualDiscountPercent;

  return {
    role,
    period,
    planId,
    name: plan.name,
    amount,
    currency: 'USD',
    description,
    durationDays,
    monthlyEquivalent,
    savings,
    discountPercent,
  };
};

export const getPlanFromAmount = (
  amount: number
): { role: PlanRole; period: PlanPeriod; plan: PricingPlan; durationDays: number } | null => {
  // Coincidencias exactas y tolerancias para importes oficiales
  // Patinador mensual: $4.99 (soporta legacy $5.00)
  if (Math.abs(amount - SKATER_PLAN.monthlyPrice) <= 0.05 || Math.abs(amount - 5.0) <= 0.05) {
    return { role: 'skater', period: 'monthly', plan: SKATER_PLAN, durationDays: 30 };
  }
  // Patinador anual: $47.90 (soporta legacy $48.00)
  if (Math.abs(amount - SKATER_PLAN.annualPrice) <= 0.15 || Math.abs(amount - 48.0) <= 0.15) {
    return { role: 'skater', period: 'annual', plan: SKATER_PLAN, durationDays: 365 };
  }
  // Entrenador mensual: $9.99 (soporta legacy $8.00)
  if (Math.abs(amount - COACH_PLAN.monthlyPrice) <= 0.05 || Math.abs(amount - 8.0) <= 0.05) {
    return { role: 'coach', period: 'monthly', plan: COACH_PLAN, durationDays: 30 };
  }
  // Entrenador anual: $83.92 (soporta legacy $67.20)
  if (Math.abs(amount - COACH_PLAN.annualPrice) <= 0.15 || Math.abs(amount - 67.2) <= 0.15) {
    return { role: 'coach', period: 'annual', plan: COACH_PLAN, durationDays: 365 };
  }
  return null;
};

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


