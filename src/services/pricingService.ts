/**
 * pricingService.ts — Fuente Única de Verdad para Planes, Precios y Descuentos de SkateCoreo
 *
 * Precios oficiales actualizados:
 *   - Patinador / Alumno: $4.99 / mes | $47.90 / año (20% de descuento anual, equivalente a $3.99/mes)
 *   - Entrenador: $9.99 / mes | $83.90 / año (30% de descuento anual, equivalente a $6.99/mes)
 *   - Licencias de Clubes / Escuelas: Descuentos escalonados por volumen (10% a 50%)
 */

export type PlanPeriod = 'monthly' | 'annual';
export type PlanRole = 'skater' | 'coach';

export interface PricingPlan {
  role: PlanRole;
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  annualDiscountPercent: number;
  monthlyEquivalent: number;
  annualSavings: number;
  features: string[];
  highlight?: string;
}

export const SKATER_PLAN: PricingPlan = {
  role: 'skater',
  name: 'Patinadora / Patinador',
  monthlyPrice: 4.99,
  annualPrice: 47.90, // $4.99 * 12 = $59.88 -> 20% descuento = $47.90
  annualDiscountPercent: 20,
  monthlyEquivalent: 3.99,
  annualSavings: 11.98,
  features: [
    'Pista 2D de Patinaje con trazado cinemático',
    'Estudio de Audio con sincronización musical y BPM',
    'Catálogo reglamentario de figuras y cálculo de BV',
    'Exportación e importación de coreografías (.coreo)',
    'Modo Entrenamiento 100% Offline (sin red en la pista)',
    'Hasta 3 dispositivos: 1 PC + 1 Tablet + 1 Celular',
  ],
};

export const COACH_PLAN: PricingPlan = {
  role: 'coach',
  name: 'Entrenador / Entrenadora',
  monthlyPrice: 9.99,
  annualPrice: 83.90, // $9.99 * 12 = $119.88 -> 30% descuento = $83.90
  annualDiscountPercent: 30,
  monthlyEquivalent: 6.99,
  annualSavings: 35.98,
  highlight: 'Ahorro del 30% en suscripción anual',
  features: [
    'Todo lo incluido en el Plan Patinador',
    'Panel de Entrenadores exclusivo y desacoplado',
    'Gestión integral de patinadoras/es y fichas deportivas',
    'Organización de coreografías por atleta y temporada',
    'Conexión en 1-clic con Google Drive, OneDrive y Dropbox',
    'Backup completo y restauración de base de datos local',
    'Modo Offline garantizado para viajes y pistas sin internet',
    'Soporte prioritario para entrenadores y clubes',
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

/**
 * Retorna el descuento por volumen aplicable para un número dado de licencias
 */
export const getVolumeDiscountPercent = (totalLicenses: number): number => {
  for (const tier of VOLUME_DISCOUNT_TIERS) {
    if (totalLicenses >= tier.minLicenses && (tier.maxLicenses === null || totalLicenses <= tier.maxLicenses)) {
      return tier.discountPercent;
    }
  }
  return 0;
};

/**
 * Calcula el monto a pagar según rol, período y cantidad
 */
export const calculatePrice = (
  role: PlanRole,
  period: PlanPeriod,
  licenses = 1
): { unitPrice: number; subtotal: number; discountPercent: number; total: number } => {
  const plan = PRICING_PLANS[role];
  const unitPrice = period === 'annual' ? plan.annualPrice : plan.monthlyPrice;
  const subtotal = Number((unitPrice * licenses).toFixed(2));
  const volumeDiscount = licenses > 1 ? getVolumeDiscountPercent(licenses) : 0;
  const discountAmount = Number(((subtotal * volumeDiscount) / 100).toFixed(2));
  const total = Number((subtotal - discountAmount).toFixed(2));

  return {
    unitPrice,
    subtotal,
    discountPercent: volumeDiscount,
    total,
  };
};
