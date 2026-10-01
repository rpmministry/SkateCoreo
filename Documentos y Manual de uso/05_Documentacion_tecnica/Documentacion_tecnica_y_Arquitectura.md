# SkateCoreo - Documentación Técnica y Arquitectura

**Fecha:** 1 de octubre de 2026
**Versión:** 1.0.0 (Basado en la aplicación actual PWA desplegada)

## 1. Visión General de la Arquitectura
SkateCoreo es una Progressive Web App (PWA) desarrollada con el stack React + Vite. La aplicación está diseñada para ser fuertemente local-first (offline-capable) para soportar a entrenadores y atletas en pistas de hielo o cemento donde la conectividad puede ser limitada.

### Stack Tecnológico
* **Frontend Core:** React 18, TypeScript, Vite.
* **Estado Global:** Zustand.
* **Estilos:** Tailwind CSS, PostCSS.
* **Componentes de UI:** Lucide React (iconografía).
* **Gestión de Audio:** Web Audio API, implementado en un motor personalizado (`AudioEngine.ts`, `PlaybackCore.ts`, `VoiceCueEngine.ts`).
* **Visión y Canvas:** `RinkRenderer.ts` y motores de visión artificial para escaneo de papel (`PaperScanner.ts`).
* **Internacionalización:** i18next (Soporte actual: en, es).
* **Base de Datos / Backend:** Supabase (`@supabase/supabase-js`), aunque el almacenamiento principal de la sesión en curso opera con `LocalStorage` y adaptadores opcionales (Dropbox, Google Drive).

## 2. Flujo de Datos y Estado (`Zustand`)
La arquitectura de estado se divide en stores especializados:
* `useChoreographyStore.ts`: Gestiona el modelo coreográfico, nodos de la pista, tiempos, y trayectorias (`FreehandPathEngine`).
* `useAudioStudioStore.ts`: Gestiona el DAW multicanal, cortes de audio, mezclas y pistas.
* `useAuthStore.ts`: Gestiona la sesión SaaS del usuario y el rol (atleta, entrenador).
* `useCoachStore.ts`: Gestiona el directorio de atletas, evaluaciones y perfiles de los patinadores.

## 3. Arquitectura del Motor de Audio
El motor de audio de SkateCoreo es un componente complejo que permite sincronizar la música con nodos posicionales en la pista y emitir indicaciones de voz (Text-to-Speech o Voice Cues).

### Componentes Clave:
1. `AudioEngine.ts` / `PlaybackCore.ts`: Controlan el bucle de reproducción principal sincronizado (`PlaybackClock`).
2. `studioMixdown.ts`: Renderiza en tiempo real las diferentes pistas del estudio.
3. `VoiceCueEngine.ts`: Inyecta la voz de los entrenadores o indicaciones generadas algorítmicamente en los instantes precisos.

> **Captura CodeSnap:** (Representación de la integración del motor)
```typescript
// src/core/audio/PlaybackCore.ts
export class PlaybackCore {
  private clock: PlaybackClock;
  private audioContext: AudioContext;
  
  constructor() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.clock = new PlaybackClock(this.audioContext);
  }

  public syncWithVisuals(currentTime: number) {
    // Sincroniza la posición del patinador en la pista 2D con el tiempo del audio
  }
}
```

## 4. Visión por Computadora (De Papel a Digital)
El módulo `PaperToDigital` (`src/core/vision/scan/PaperScanner.ts`) permite la digitalización de bocetos en papel de las coreografías.
Implementa una segmentación de tinta (`InkSegmentation.ts`) y detección de candidatos a nodos (`NodeCandidateDetector.ts`) utilizando transformaciones homográficas (`HomographyWarp.ts`) para proyectar la imagen tomada con la cámara sobre las proporciones oficiales de la pista de patinaje.

## 5. Renderizado 2D de la Pista
Utiliza Canvas API pura gestionada por `RinkRenderer.ts` y cálculos espaciales en `RinkMath.ts`.
Soporta trazado a mano alzada (`FreehandPathEngine.ts`) con algoritmos de suavizado de curvas para representar los filos y trayectorias reales de un patín.

## 6. Generación de Reportes y Licencias
Para entrenadores de grado avanzado, incluye generación de PDFs in-browser con `jspdf`. El archivo `pdfTemplateGenerator.ts` se encarga de estructurar el PDF con el modelo de pista y las anotaciones técnicas de la rutina (saltos, trompos, pasos).

## 7. Despliegue y CI/CD
El proyecto se despliega automáticamente en Vercel, definido en el archivo `vercel.json` y la configuración `vite.config.ts`. Está adaptado para ser instalable como PWA en iOS y Android.
