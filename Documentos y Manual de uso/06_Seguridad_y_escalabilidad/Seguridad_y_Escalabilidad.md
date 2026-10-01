# Seguridad, Arquitectura y Escalabilidad

**Fecha:** 1 de octubre de 2026

## 1. Seguridad Actualmente Implementada

SkateCoreo maneja datos confidenciales, rutinas originales y evaluaciones, lo que requiere garantías de privacidad.

* **Autenticación (Supabase / Auth Store):** La plataforma implementa sesiones protegidas a través de `useAuthStore.ts` y tokens de sesión para el portal de administración (`CoachPortal.tsx`). Existe validación en las rutas mediante `ProtectedLayout.tsx`.
* **Dispositivos y Sesiones:** Incluye un componente específico `DeviceSecurityModal.tsx` para gestionar intentos de recuperación o sesiones activas.
* **Procesamiento de Audio Local:** Como el motor de audio (`AudioEngine.ts`) funciona sobre la Web Audio API dentro del navegador, los datos de audio crudo (RAW) del usuario no se transmiten innecesariamente al servidor para procesar mezcla o volumen, protegiendo derechos de autor e intimidad de la edición, hasta que se sincronizan con la nube.
* **Almacenamiento (StorageManager.ts):** Implementa proveedores que pueden integrarse con el almacenamiento local seguro o APIs externas como Google Drive / Dropbox, lo que permite al entrenador controlar dónde descansan sus datos pesados.

## 2. Escalabilidad

### Capacidad Actual
* **Infraestructura Serverless:** El frontend está desplegado sobre Vercel. La escalabilidad web es virtualmente ilimitada para entrega de estáticos y PWA.
* **Local-First:** La arquitectura `useChoreographyStore.ts` con Zustand y `LocalStorageProvider` asegura que si 500 entrenadores usan la app simultáneamente en pistas sin internet, no hay carga en los servidores de SkateCoreo.
* **Procesamiento Distribuido:** La carga pesada de cálculo de la visión computacional (Homography) y análisis de BPM del audio (`BpmDetector.ts`) se ejecuta en el lado del cliente (Navegador).

### Capacidad Futura y Limitaciones
* **Almacenamiento de Audio Centralizado:** Si el uso de la base de datos para almacenar archivos de audio masivos (multitracks sin compresión) se centralizara exclusivamente en Supabase, los costos de S3 / Storage se dispararían. Es escalable, pero dependiente de la monetización de suscripciones.
* **Concurrencia y Sincronización en Tiempo Real:** Actualmente el sistema de edición es unijugador (un entrenador edita un programa a la vez). Si se requiriera que el entrenador y el atleta modifiquen los nodos a la vez (multiplayer real-time), se debería implementar WebSockets a través de Supabase Realtime, lo que exigiría más control sobre conflictos de estado en Zustand.
