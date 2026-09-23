/**
 * SkateCoreo Paper-to-Digital · Tipos del pipeline de visión (v2).
 *
 * Estos módulos son 100% PUROS (sin DOM, sin Canvas): reciben `RgbaImage`
 * (búfer RGBA) y devuelven máscaras/estructuras. El adaptador de Canvas en
 * `PaperScannerCanvas.ts` los conecta a la UI. Esto los hace verificables en
 * Node (pruebas automáticas) y ejecutables en Web Worker.
 *
 * Unidad de trabajo: la imagen YA RECTIFICADA por homografía, de modo que el
 * rectángulo de la pista (con los 4 fiduciales en sus esquinas) ocupa toda la
 * imagen. Las coordenadas "normalizadas" son directamente metros de pista.
 */

/** Imagen RGBA cruda (equivalente a `ImageData` sin depender del DOM). */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface Pt {
  x: number;
  y: number;
}

export interface Rink {
  lengthMeters: number;
  widthMeters: number;
  cornerRoundsMeters: number;
}

export const DEFAULT_RINK: Rink = {
  lengthMeters: 50,
  widthMeters: 25,
  cornerRoundsMeters: 3.5,
};

/** Canal de tinta manuscrita admitido. La plantilla impresa nunca es roja/azul. */
export type InkChannel = 'red' | 'blue';

/** Máscaras de color (1 = píxel de tinta, 0 = no). */
export interface ColorMasks {
  red: Uint8Array;
  blue: Uint8Array;
  /** Unión de rojo + azul. */
  ink: Uint8Array;
}

/** Segmento/círculo impreso conocido de antemano por el modelo de plantilla. */
export interface PrintedSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface PrintedCircle {
  cx: number;
  cy: number;
  r: number;
}

/** Candidato a nodo propuesto por el detector (aún SIN validar). */
export interface RingCandidate {
  center: Pt;
  innerRadiusPx: number;
  outerRadiusPx: number;
  /** Fracción [0,1] de direcciones angulares que encuentran tinta del anillo. */
  angularCoverage: number;
  /** Error RMS del ajuste de círculo (px). */
  circleRmsPx: number;
  /** Grosor medio del trazo del anillo (px). */
  strokeWidthPx: number;
  /** Nº de píxeles de tinta del anillo estimados. */
  ringPixelCount: number;
  /** Origen de la propuesta. */
  source: 'hole' | 'ring';
  /** Fracción de píxeles del anillo que pertenecen a rojo vs azul. */
  redFraction: number;
  blueFraction: number;
}

/** Confianza independiente por aspecto, más la agregada. */
export interface NodeConfidence {
  colorConfidence: number;
  circleConfidence: number;
  positionConfidence: number;
  inkDensityConfidence: number;
  digitConfidence: number;
  overall: number;
}

export type NodeDecision = 'accept' | 'review' | 'reject';

/** Nodo validado listo para digitalizar. */
export interface ScannedNode {
  /** Posición en metros de pista (0..longitud, 0..anchura). */
  xMeters: number;
  yMeters: number;
  channel: InkChannel;
  radiusMeters: number;
  confidence: NodeConfidence;
  /** Dígito manuscrito leído (null = sin número o no reconocido). */
  digit: number | null;
  /** El usuario debe confirmarlo en la UI (nunca se inventa). */
  review: boolean;
  decision: NodeDecision;
  /** Motivos legibles de la decisión (diagnóstico). */
  reasons: string[];
}

/** Imágenes/máscaras intermedias para el MODO DIAGNÓSTICO. */
export interface ScanDebug {
  printedMask: Uint8Array;
  inkMask: Uint8Array;
  residualMask: Uint8Array;
  redMask: Uint8Array;
  blueMask: Uint8Array;
  candidates: RingCandidate[];
}
