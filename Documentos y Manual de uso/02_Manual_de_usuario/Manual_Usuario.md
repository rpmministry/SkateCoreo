# SkateCoreo - Manual de Usuario Oficial

**Fecha de Revisión:** 1 de octubre de 2026
**Versión de la Aplicación:** Actual 

Bienvenido a SkateCoreo, la plataforma definitiva para el diseño de coreografías de patinaje artístico sobre ruedas y hielo.

## 1. Instalación y Acceso
SkateCoreo es una Aplicación Web Progresiva (PWA). No requiere descargas de la App Store o Google Play.
1. Abre tu navegador (Safari en iOS, Chrome en Android/Desktop) y visita `https://skate-coreo.vercel.app/`
2. En iOS, presiona el botón "Compartir" y luego "Agregar a la pantalla de inicio".
3. En Android, Chrome te sugerirá automáticamente "Instalar Aplicación".

## 2. Navegación Principal
Al ingresar (vista `HomeView.tsx`), verás las tres áreas principales:
* **Pista 2D (Rink Canvas):** El lienzo en blanco para trazar tu coreografía.
* **Audio Studio:** El editor multipista para tu música.
* **Panel del Entrenador:** (Solo cuentas de Entrenador) Directorio de atletas y evaluaciones.

## 3. Pista 2D: Trazando el Programa
1. Ingresa a "Abrir Pista 2D".
2. **Dibujar Ruta (FreehandPath):** Selecciona la herramienta del lápiz en el `NodePlacementTray`. Haz click y arrastra sobre la pista para dibujar el filo del patín.
3. **Colocar Elementos:** En la barra inferior, selecciona un Salto (Jump) o Trompo (Spin) y haz click en un punto específico de tu trazo.
4. **Reproducción Espacial:** Presiona el botón ▶️ Play. Verás un indicador moverse por la línea que dibujaste al ritmo exacto de la música.

## 4. Audio Studio: Mezcla y Sincronización
1. Ve a "Audio Studio". Verás un DAW lite (`AudioStudioView.tsx`).
2. Haz click en "Añadir Pista" para subir tu MP3.
3. **Voice Cues Automáticos:** Al colocar un salto en la Pista 2D, el `VoiceCueEngine` puede sintetizar una voz (TTS) que diga el nombre del salto 2 segundos antes de que ocurra en el audio. Activa esta opción en las preferencias de la pista.

## 5. De Papel a Digital
¿Hiciste un boceto a mano?
1. En el menú, selecciona "Escanear Papel" (`PaperToDigitalModal.tsx`).
2. Sube la foto. Ajusta las cuatro esquinas usando el `CornerPinAdjuster`.
3. El sistema reconocerá tus trazos y los mapeará a las medidas de 25x50m.

## 6. Panel del Entrenador y Evaluaciones Rollart
1. Ve a "Panel del Entrenador".
2. Abre la ficha de tu patinador.
3. Ve a "Panel Técnico". A medida que armas la coreografía, puedes asignar niveles de dificultad a los trompos y saltos.
4. Al finalizar, haz click en **Generar PDF** para obtener el formulario oficial para presentar a los jurados.

## 7. Errores Conocidos y Soluciones
* **El audio se detiene al bloquear el móvil:** Asegúrate de no tener el modo "Ahorro de Batería" activo, lo que pausa los `AudioContext` en navegadores móviles.
* **El escáner de papel deforma la línea:** Asegúrate de que los cuatro puntos del `CornerPinAdjuster` coincidan exactamente con las esquinas del borde de la pista dibujada.

---
*Fin del Manual.*
