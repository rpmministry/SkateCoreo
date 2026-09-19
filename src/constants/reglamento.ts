/**
 * reglamento.ts — Motor de Reglas del Reglamento Nacional de Patinaje Artístico 2026
 *
 * Contiene:
 *  1. Clasificación oficial de Categorías según la edad del patinador/a.
 *  2. Mapeo estricto de Figuras Obligatorias por Eficiencia y Categoría (Grupos 1 y 2).
 *  3. Catálogo oficial de Figuras Libres, Posiciones Base, Variaciones y Elementos Artísticos.
 */

// ── Tipos Oficiales ─────────────────────────────────────────────
export type CategoriaReglamento = 'TOT' | 'MINI' | 'ESPOIR' | 'CADET' | 'MAYOR';
export type EficienciaReglamento = 'PRE PROMO' | 'BÁSICA' | 'INTERMEDIA';

export interface GrupoObligatorio {
  grupo: 'Grupo 1' | 'Grupo 2';
  figuras: string[];
}

export interface FiguraElemento {
  nombre: string;
  categoriaElemento: 'Posición Base' | 'Variación' | 'Elemento Artístico';
}

// ── 1. Cálculo Estricto de Categoría por Edad ────────────────────
export const getCategoriaByEdad = (edad: number): CategoriaReglamento => {
  const age = Math.max(0, Math.floor(edad));
  if (age <= 9) return 'TOT';
  if (age <= 11) return 'MINI';
  if (age <= 13) return 'ESPOIR';
  if (age <= 15) return 'CADET';
  return 'MAYOR';
};

export const getDescripcionCategoria = (cat: CategoriaReglamento): string => {
  switch (cat) {
    case 'TOT': return 'Hasta 9 años';
    case 'MINI': return '10 y 11 años';
    case 'ESPOIR': return '12 y 13 años';
    case 'CADET': return '14 y 15 años';
    case 'MAYOR': return '16 años y más';
  }
};

// ── 2. Diccionario de Figuras Obligatorias ───────────────────────
export const FIGURAS_OBLIGATORIAS_MAP: Record<
  EficienciaReglamento,
  Partial<Record<CategoriaReglamento, GrupoObligatorio[]>>
> = {
  'PRE PROMO': {
    TOT: [
      { grupo: 'Grupo 1', figuras: ['1-2S'] },
      { grupo: 'Grupo 2', figuras: ['2-1S'] },
    ],
    MINI: [
      { grupo: 'Grupo 1', figuras: ['3-2S'] },
      { grupo: 'Grupo 2', figuras: ['3-1S'] },
    ],
    ESPOIR: [
      { grupo: 'Grupo 1', figuras: ['3S-8'] },
      { grupo: 'Grupo 2', figuras: ['4S-8'] },
    ],
    CADET: [
      { grupo: 'Grupo 1', figuras: ['3S-8'] },
      { grupo: 'Grupo 2', figuras: ['4S-8'] },
    ],
    MAYOR: [
      { grupo: 'Grupo 1', figuras: ['3S-8'] },
      { grupo: 'Grupo 2', figuras: ['4S-9'] },
    ],
  },
  'BÁSICA': {
    MINI: [
      { grupo: 'Grupo 1', figuras: ['4-8'] },
      { grupo: 'Grupo 2', figuras: ['4-9'] },
    ],
    ESPOIR: [
      { grupo: 'Grupo 1', figuras: ['10-26'] },
      { grupo: 'Grupo 2', figuras: ['11-27'] },
    ],
    CADET: [
      { grupo: 'Grupo 1', figuras: ['10-26'] },
      { grupo: 'Grupo 2', figuras: ['11-27'] },
    ],
    MAYOR: [
      { grupo: 'Grupo 1', figuras: ['10-22-14'] },
      { grupo: 'Grupo 2', figuras: ['11-22-14'] },
    ],
  },
  'INTERMEDIA': {
    ESPOIR: [
      { grupo: 'Grupo 1', figuras: ['18-10-14'] },
      { grupo: 'Grupo 2', figuras: ['22-11-14'] },
    ],
    CADET: [
      { grupo: 'Grupo 1', figuras: ['18-10-14'] },
      { grupo: 'Grupo 2', figuras: ['22-11-14'] },
    ],
    MAYOR: [
      { grupo: 'Grupo 1', figuras: ['18-28-15'] },
      { grupo: 'Grupo 2', figuras: ['13-19-30'] },
    ],
  },
};

/**
 * Retorna las figuras obligatorias sugeridas agrupadas por Grupo 1 y Grupo 2
 */
export const getFigurasObligatorias = (
  eficiencia: EficienciaReglamento,
  categoria: CategoriaReglamento
): GrupoObligatorio[] => {
  return FIGURAS_OBLIGATORIAS_MAP[eficiencia]?.[categoria] || [];
};

/**
 * Retorna un array plano con todas las figuras obligatorias de los grupos disponibles
 */
export const getListaPlanaFigurasObligatorias = (
  eficiencia: EficienciaReglamento,
  categoria: CategoriaReglamento
): { label: string; valor: string; grupo: string }[] => {
  const grupos = getFigurasObligatorias(eficiencia, categoria);
  const resultado: { label: string; valor: string; grupo: string }[] = [];

  for (const g of grupos) {
    for (const f of g.figuras) {
      resultado.push({
        label: `${g.grupo}: ${f}`,
        valor: f,
        grupo: g.grupo,
      });
    }
  }

  return resultado;
};

// ── 3. Catálogo de Figuras Libres y Elementos Artísticos ────────
export const FIGURAS_LIBRES_Y_ARTISTICAS: FiguraElemento[] = [
  // Posiciones Base
  { nombre: 'Upright', categoriaElemento: 'Posición Base' },
  { nombre: 'Sit', categoriaElemento: 'Posición Base' },
  { nombre: 'Camel', categoriaElemento: 'Posición Base' },

  // Variaciones
  { nombre: 'Split', categoriaElemento: 'Variación' },
  { nombre: 'Torso', categoriaElemento: 'Variación' },
  { nombre: 'Biellmann', categoriaElemento: 'Variación' },
  { nombre: 'Sit Forward', categoriaElemento: 'Variación' },
  { nombre: 'Sit Behind (Tortuga)', categoriaElemento: 'Variación' },
  { nombre: 'Sit Sideways', categoriaElemento: 'Variación' },
  { nombre: 'Camel Lay Over', categoriaElemento: 'Variación' },
  { nombre: 'Camel Forward', categoriaElemento: 'Variación' },
  { nombre: 'Camel Sideways', categoriaElemento: 'Variación' },
  { nombre: 'Inverted Camel', categoriaElemento: 'Variación' },
  { nombre: 'Bryant', categoriaElemento: 'Variación' },

  // Elementos Artísticos de Campo
  { nombre: 'Sit en dos pies', categoriaElemento: 'Elemento Artístico' },
  { nombre: 'Lunge', categoriaElemento: 'Elemento Artístico' },
  { nombre: 'Arched lunge', categoriaElemento: 'Elemento Artístico' },
  { nombre: 'Half Hydroblade', categoriaElemento: 'Elemento Artístico' },
  { nombre: 'Eagle', categoriaElemento: 'Elemento Artístico' },
  { nombre: 'Spread Eagle', categoriaElemento: 'Elemento Artístico' },
  { nombre: 'Half Hackenmond', categoriaElemento: 'Elemento Artístico' },
  { nombre: 'Hackenmond', categoriaElemento: 'Elemento Artístico' },
  { nombre: 'Ina Bauer', categoriaElemento: 'Elemento Artístico' },
  { nombre: 'Hydroblade', categoriaElemento: 'Elemento Artístico' },
  { nombre: 'Charlotte', categoriaElemento: 'Elemento Artístico' },
  { nombre: 'Fan', categoriaElemento: 'Elemento Artístico' },
];

export const EFICIENCIAS_DISPONIBLES: EficienciaReglamento[] = [
  'PRE PROMO',
  'BÁSICA',
  'INTERMEDIA',
];

