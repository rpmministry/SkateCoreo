/**
 * categoryService.ts — Servicio centralizado de cálculo de Edad y Categoría Oficial
 *
 * REUTILIZA directamente el motor oficial de `src/constants/reglamento.ts`:
 * - `getCategoriaByEdad(edad)`
 * - `getDescripcionCategoria(cat)`
 * - `CATEGORIAS_REGLAMENTO`
 *
 * Sin duplicar tablas ni reglas divergentes.
 */

import {
  CategoriaReglamento,
  getCategoriaByEdad,
  getDescripcionCategoria,
} from '../../constants/reglamento';

export interface CategoryCalculationResult {
  birthDate: string;
  exactAge: number;
  sportsAge: number; // Edad cumplida en el año calendario en curso (Reglamento RollArt)
  category: CategoriaReglamento;
  categoryDescription: string;
  nextCategory?: CategoriaReglamento;
  nextCategoryChangeDate?: string;
  daysUntilNextCategory?: number;
  isUpcomingChangeWithin90Days: boolean;
}

/**
 * Calcula la edad cronológica exacta (años cumplidos al día de hoy).
 */
export function calculateExactAge(birthDateStr: string, refDate: Date = new Date()): number {
  if (!birthDateStr) return 0;
  const birth = new Date(birthDateStr);
  if (isNaN(birth.getTime())) return 0;

  let age = refDate.getFullYear() - birth.getFullYear();
  const m = refDate.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && refDate.getDate() < birth.getDate())) {
    age--;
  }
  return Math.max(0, age);
}

/**
 * Calcula la edad deportiva oficial (edad que cumple el patinador durante el año de competición).
 */
export function calculateSportsAge(birthDateStr: string, refYear: number = new Date().getFullYear()): number {
  if (!birthDateStr) return 0;
  const birth = new Date(birthDateStr);
  if (isNaN(birth.getTime())) return 0;
  return Math.max(0, refYear - birth.getFullYear());
}

/**
 * Computa la categoría oficial y el diagnóstico de próximo cambio de categoría
 * a partir de la fecha de nacimiento.
 */
export function calculateCategoryDetails(
  birthDateStr: string,
  refDate: Date = new Date()
): CategoryCalculationResult {
  const exactAge = calculateExactAge(birthDateStr, refDate);
  const sportsAge = calculateSportsAge(birthDateStr, refDate.getFullYear());

  // Usamos exactAge para la categoría reglamentaria
  const category = getCategoriaByEdad(exactAge);
  const categoryDescription = getDescripcionCategoria(category);

  let nextCategory: CategoriaReglamento | undefined;
  let nextCategoryChangeDate: string | undefined;
  let daysUntilNextCategory: number | undefined;
  let isUpcomingChangeWithin90Days = false;

  // Determinar la edad en la que salta a la siguiente categoría
  let targetAgeForNextCat: number | null = null;
  if (exactAge <= 9) targetAgeForNextCat = 10;
  else if (exactAge <= 11) targetAgeForNextCat = 12;
  else if (exactAge <= 13) targetAgeForNextCat = 14;
  else if (exactAge <= 15) targetAgeForNextCat = 16;

  if (targetAgeForNextCat !== null && birthDateStr) {
    const birth = new Date(birthDateStr);
    if (!isNaN(birth.getTime())) {
      const changeDate = new Date(birth.getFullYear() + targetAgeForNextCat, birth.getMonth(), birth.getDate());
      nextCategoryChangeDate = changeDate.toISOString().slice(0, 10);
      nextCategory = getCategoriaByEdad(targetAgeForNextCat);

      const diffTime = changeDate.getTime() - refDate.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      daysUntilNextCategory = Math.max(0, diffDays);
      isUpcomingChangeWithin90Days = diffDays > 0 && diffDays <= 90;
    }
  }

  return {
    birthDate: birthDateStr,
    exactAge,
    sportsAge,
    category,
    categoryDescription,
    nextCategory,
    nextCategoryChangeDate,
    daysUntilNextCategory,
    isUpcomingChangeWithin90Days,
  };
}

export { getCategoriaByEdad, getDescripcionCategoria };
