# Beneficios para Atletas, Entrenadores y Clubes

**Fecha:** 1 de octubre de 2026

## 1. Patinadores (Atletas)
### Problema que resuelve
El atleta suele recibir la música editada y debe memorizar o apuntar la coreografía. Con frecuencia pierde el ritmo o la ubicación en la pista si no está el entrenador presente.

### Funciones Aplicadas & Beneficios
* **Visor Interactivo Móvil:** Pueden abrir SkateCoreo en su móvil antes de salir a la pista y ver un mapa exacto de la rutina sincronizada con la música.
* **Metrónomo y Voice Cues:** Al entrenar en solitario, el sistema puede dictar indicaciones de voz (ej. *"prepara el Axel"*), sirviendo como un entrenador virtual que asegura la memorización temporal de la coreografía.
* **Aislamiento de Secciones:** Si una sección es difícil, el atleta puede repetirla en bucle en el reproductor de audio (`RinkAudioPlayer.tsx`).

## 2. Entrenadores
### Problema que resuelve
El entrenador pasa horas dibujando hojas con la pista de hielo, cortando música en su computadora, y calculando los tiempos y puntajes en Excel. 

### Funciones Aplicadas & Beneficios
* **Paper To Digital:** El entrenador dibuja su rutina en papel, le toma una foto con el móvil y SkateCoreo detecta la pista, transfiere las líneas a vectores digitales (`HomographyWarp.ts`), y los coloca sobre el plano.
* **Audio Studio Integrado:** No tienen que usar otras aplicaciones. Pueden cortar pistas, unir múltiples audios, superponer un Voice Cue grabando desde el micrófono en la misma app, y todo queda atado al programa del alumno.
* **Directorio y Evaluaciones (Coach Dashboard):** Todo el historial de un atleta y las evaluaciones bajo reglamentos específicos (`Rollart`) están almacenadas y pueden ser exportadas a PDF al instante.

## 3. Clubes y Federaciones
### Problema que resuelve
El conocimiento técnico de las coreografías se lo lleva el entrenador, y el club no tiene un archivo central ni un formato estandarizado para sus atletas.

### Funciones Aplicadas & Beneficios
* **Estandarización:** Uso de catálogos y plantillas formales (exportación de PDF técnico).
* **Almacenamiento Centralizado (StorageProvider):** Los programas y la música de todos los patinadores están respaldados y disponibles para los directores deportivos.
* **Facilidad en Competiciones:** Entregar un PDF prolijo y técnico a los jurados garantiza mayor profesionalidad que una hoja dibujada a mano.
