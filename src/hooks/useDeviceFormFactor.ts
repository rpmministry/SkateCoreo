import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  classifyFormFactor,
  getLayoutMode,
  getPreferredOrientation,
  readDeviceCapabilities,
  type DeviceCapabilities,
  type FormFactor,
  type LayoutMode,
} from '../utils/deviceFormFactor';

export interface DeviceFormFactorState {
  /** Clase de dispositivo: teléfono, tablet ≥7" o escritorio. */
  formFactor: FormFactor;
  /** Composición visual: 'mobile' en teléfonos, 'desktop' en tablet/desktop. */
  layoutMode: LayoutMode;
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  /** Hay pantalla táctil (aunque exista además ratón/trackpad). */
  isTouch: boolean;
  /** Puntero principal grueso (dedo). */
  coarsePointer: boolean;
  orientation: 'portrait' | 'landscape';
  /** Orientación recomendada por producto (portrait en teléfono). */
  preferredOrientation: 'portrait' | 'landscape';
  /**
   * true cuando el inspector debe presentarse ACOPLADO (panel lateral) en vez
   * de como hoja inferior. Coincide con cuándo el CSS muestra el panel derecho:
   * tablets desde 768 px y escritorio desde 1024 px.
   */
  hasDockedInspector: boolean;
}

function isLandscape(width: number, height: number): boolean {
  return width > height;
}

/** ¿El inspector acoplado está visible con este espacio/clase? */
function computeDockedInspector(formFactor: FormFactor, width: number): boolean {
  if (formFactor === 'desktop') return width >= 1024;
  if (formFactor === 'tablet') return width >= 768;
  return false;
}

function buildState(caps: DeviceCapabilities): DeviceFormFactorState {
  const formFactor = classifyFormFactor(caps);
  const width = Math.round(caps.width);
  const height = Math.round(caps.height);
  return {
    formFactor,
    layoutMode: getLayoutMode(formFactor),
    isPhone: formFactor === 'phone',
    isTablet: formFactor === 'tablet',
    isDesktop: formFactor === 'desktop',
    isTouch: caps.hasTouch,
    coarsePointer: caps.coarsePointer,
    orientation: isLandscape(width, height) ? 'landscape' : 'portrait',
    preferredOrientation: getPreferredOrientation(formFactor),
    hasDockedInspector: computeDockedInspector(formFactor, width),
  };
}

/**
 * Clave de decisión: cambia SOLO cuando cambia algo observable (clase de
 * dispositivo, panel acoplado, orientación o capacidades táctiles), nunca por
 * cada píxel. Así un resize continuo no re-renderiza toda la app.
 */
function decisionKey(caps: DeviceCapabilities): string {
  const formFactor = classifyFormFactor(caps);
  const width = Math.round(caps.width);
  const height = Math.round(caps.height);
  return [
    formFactor,
    computeDockedInspector(formFactor, width) ? '1' : '0',
    isLandscape(width, height) ? 'L' : 'P',
    caps.hasTouch ? '1' : '0',
    caps.coarsePointer ? '1' : '0',
    caps.noHover ? '1' : '0',
  ].join('|');
}

/**
 * useDeviceFormFactor — clasificación robusta de dispositivo.
 *
 * Combina capacidad táctil, tipo de puntero, espacio real y orientación (ver
 * `utils/deviceFormFactor`). Publica además `data-form-factor` en `<html>` para
 * que el CSS pueda aplicar la composición correcta sin depender únicamente de
 * `pointer`/`hover` (que un iPad con trackpad puede reportar como fino).
 */
export function useDeviceFormFactor(): DeviceFormFactorState {
  const [caps, setCaps] = useState<DeviceCapabilities>(() => readDeviceCapabilities());
  const lastKeyRef = useRef<string>(decisionKey(caps));

  useEffect(() => {
    let raf: number | null = null;

    const schedule = () => {
      if (raf !== null) return;
      raf = window.requestAnimationFrame(() => {
        raf = null;
        const next = readDeviceCapabilities();
        const key = decisionKey(next);
        if (key === lastKeyRef.current) return;
        lastKeyRef.current = key;
        setCaps(next);
      });
    };

    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    window.addEventListener('pageshow', schedule);

    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    vv?.addEventListener?.('resize', schedule);

    const media: MediaQueryList[] = [];
    if (typeof window.matchMedia === 'function') {
      const queries = ['(pointer: coarse)', '(hover: none)', '(orientation: portrait)'];
      for (const q of queries) {
        const mql = window.matchMedia(q);
        media.push(mql);
        mql.addEventListener?.('change', schedule);
      }
    }

    return () => {
      if (raf !== null) window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      window.removeEventListener('pageshow', schedule);
      vv?.removeEventListener?.('resize', schedule);
      for (const mql of media) mql.removeEventListener?.('change', schedule);
    };
  }, []);

  // Antes de pintar: el CSS (`data-form-factor`) debe conocer la clase de
  // dispositivo desde el primer frame. Se deriva del estado ya calculado, sin
  // volver a medir el DOM (evita forzar un layout síncrono).
  useLayoutEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const previous = root.dataset.formFactor;
    root.dataset.formFactor = classifyFormFactor(caps);
    return () => {
      if (previous === undefined) delete root.dataset.formFactor;
      else root.dataset.formFactor = previous;
    };
  }, [caps]);

  return buildState(caps);
}
