# SkateCoreo

Plataforma Web Progresiva (PWA) de alto rendimiento orientada a jueces, panel técnico y entrenadores de patinaje artístico sobre ruedas, alineada estrictamente con las normativas oficiales de la **World Skate Artistic Technical Commission** (Sistema RollArt).

---

## Características Principales Actualmente Operativas

### 1. Panel Técnico y Motor de Reglas RollArt
- **Evaluación "One-Tap"**: Ingreso rápido de elementos técnicos.
- **Validaciones Oficiales**: Exigencia de 3 rotaciones en trompos (Spins), detección de borde para Lutz, y cálculos automáticos de degradaciones (`<`, `<<`, `<<<`).
- **Factor "T" (+10%)**: Detección temporal y bono del 10% para elementos ejecutados en la segunda mitad del programa.
- **Ficha Técnica (Report Card)**: Desglose completo de TES (Technical Element Score), PCS (Program Component Score), deducciones y Total Segment Score (TSS).

### 2. Lienzo Coreográfico 2D Interactivo
- **Pista Reglamentaria**: Representación a escala de una pista de 50x25 metros con las marcas oficiales (ejes, círculos, panel de jueces).
- **Curvas de Bézier**: Editor de trayectorias con puntos de control interactivos que permite trazar el recorrido del patinador.
- **Mapeo Espacial**: Vinculación de los elementos técnicos directamente a posiciones físicas en la pista.

### 3. Estudio de Audio (Web Audio API)
- **Motor en RAM**: Decodificación nativa de archivos (`.mp3`, `.wav`, `.m4a`) sin latencia.
- **Línea de Tiempo Multitrack**: Interfaz estilo DAW con visualización de forma de onda interactiva (Waveform).
- **Control de Reproducción**: Ajustes no destructivos de velocidad (Tempo), sincronización con la pista 2D y mitigaciones técnicas para iOS/Safari (Bypass del interruptor de silencio, manejo en background).

### 4. Digitalización de Hojas (Paper-to-Digital)
- **Extracción CV**: Módulo con corrección de perspectiva (Corner Pins) y procesamiento de imágenes para la captura, limpieza y análisis de planillas de papel.

### 5. Portal del Entrenador (Coach Portal)
- **Gestión de Atletas**: Directorio completo (Athlete Directory), dossiers individuales (Athlete Dossier View) e historial de evaluaciones.
- **Almacenamiento en la Nube (Cloud Storage)**: Integración modular que permite sincronización y respaldo a través de proveedores como Google Drive, Dropbox, OneDrive y Almacenamiento Local (IndexedDB).
- **Control de Coreografías**: Versiones de rutinas, almacenamiento de mezclas de audio y herramientas para compartir rutinas con patinadores.

### 6. Sistema SaaS de Seguridad y Autenticación
- **Control Anti-Piratería (Device Fingerprinting)**: Restricción estricta de hardware por usuario (Máx. 3 dispositivos: 1 Móvil, 1 Tablet, 1 PC).
- **Gestión de Permisos (Roles)**: Soporte completo para flujos de Superadmin, Entrenador (Coach), Administrador de Club y Patinador (Skater).
- **Pagos y Promociones**: Integración funcional con PayPal, suscripciones (Individual, Club) y sistema validado de Códigos Promocionales y Licencias.

---

## Arquitectura y Tecnologías Vigentes

- **Frontend Core**: React 18, TypeScript, Vite.
- **Interfaz y Estilos**: Tailwind CSS, Lucide React (Íconos), Zustand (Gestión de Estados).
- **Base de Datos y Almacenamiento**:
  - *Offline-First Local*: IndexedDB (`db.ts`, `coachDb.ts`) para disponibilidad sin internet.
  - *Backend Auth & Sync*: Supabase (PostgreSQL) para credenciales, licencias y sincronización segura.
- **Componentes Nativos del Navegador**:
  - `Web Audio API` (Motor de sonido).
  - `Canvas API` (Motor 2D de la pista).
  - `PWA Manifest / Service Workers` (Instalación nativa y caché offline).

---

## Estructura del Proyecto

```text
SkateCoreo/
├── public/                 # Assets públicos (Iconos, Manifiesto PWA, Service Worker, Brand kit)
├── src/
│   ├── coach/              # Coach Portal: Componentes, Servicios DB, Gestión Cloud
│   ├── components/         # Componentes UI (RinkCanvas, AudioStudio, UI genérica, Navegación)
│   ├── store/              # Stores de Zustand (Auth, Coach, Choreography, Audio)
│   ├── services/           # Lógica central: db.ts, audioEngine.ts, rollartEngine.ts, supabase.ts
│   ├── types/              # Interfaces TypeScript globales
│   ├── App.tsx             # Punto de entrada de la aplicación y enrutador principal
│   └── main.tsx            # Montaje del árbol React
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

---

## Comandos de Desarrollo

```bash
# Iniciar servidor de desarrollo en local
npm run dev

# Compilar para producción (Typecheck + Vite bundle)
npm run build

# Previsualizar compilación de producción
npm run preview
```
