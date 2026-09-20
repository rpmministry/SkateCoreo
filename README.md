# SkateCoreo - Ecosistema Digital PWA para Patinaje Artístico (Sistema RollArt)

Plataforma Web Progresiva (PWA) de alto rendimiento orientada a jueces, panel técnico y entrenadores de patinaje artístico sobre ruedas, alineada estrictamente con las normativas oficiales de la **World Skate Artistic Technical Commission**.

---

## 🚀 Características Principales

### 1. Motor de Reglas RollArt Embebido (One-Tap)
- **Degradaciones de Rotación Automáticas**:
  - `<` (*Under-rotated*): -30% en saltos simples y dobles; -20% en saltos triples y quads.
  - `<<` (*Half-rotated*): -50% en simples y dobles; -40% en triples; -30% en quads.
  - `<<<` (*Downgraded*): Asigna de forma automática el valor base del salto con una rotación menos (ejemplo: `3Lo <<<` recibe el valor de `2Lo` = 1.70 pts).
- **Validación Estricta de Trompos (Spins)**:
  - Exige un mínimo obligatorio de **3 rotaciones completas** para cualquier nivel.
  - Si el evaluador marca menos de 3 vueltas, el botón se bloquea y muestra: `"Requiere 3 vueltas completas para validación"`.
- **Bono de Distribución y Factor "T" (+10%)**:
  - Detección automática en la línea de tiempo del programa. Elementos ejecutados en la segunda mitad (`time >= half_time_ms`) reciben +10% sobre el valor base.
- **Borde de Entrada y Estado Pre-check para Lutz**:
  - Alerta visual de pre-evaluación para observar el tobillo y el filo exterior (*Outside*) antes del despegue (*stab*).
- **Botón dedicado para NJ (*No Jump*)**: Conector reglamentario con valor 0.00 pts en combinaciones.
- **Danza y Ritmo**: Botón dedicado para *Carlos Tango - Tap Down (Beat 3)*.
- **Componentes Artísticos (PCS)**: Sliders para *Skating Skills*, *Transitions*, *Performance* y *Choreography* convertidos a escala decimal oficial.
- **Ficha Técnica Oficial (Report Card)**: Desglose completo de TES, PCS, deducciones y Total Segment Score (TSS) con vista de impresión.

### 2. Motor de Audio en Memoria RAM & Mitigaciones WebKit/iOS
- Decodificación y almacenamiento en RAM con `AudioBufferSourceNode` para soporte nativo de `.m4a`, `.wav` y `.mp3`.
- Forma de onda interactiva (*waveform*) en Canvas con marcador del Factor T y cursor de tiempo.
- Modificación no destructiva de tempo/velocidad (0.5x - 1.5x) y enrutamiento estéreo de canales L/R.
- **Bypass del Interruptor de Silencio en iOS**: `navigator.audioSession.type = "playback"`.
- **Reproducción en Segundo Plano en Safari**: Topología `MediaStreamAudioDestinationNode` enlazada a elemento `<audio playsinline>` invisible.
- **Prevención de Bloqueos en iOS 18**: Suspensión y reanudación limpia en eventos `visibilitychange`.
- **Detección de Latencia Bluetooth / AirPods**: Alerta no bloqueante ante el retraso de hardware (~1s) reportado en el bug WebKit 221334.

### 3. Lienzo Coreográfico 2D (Pista 25x50m)
- Representación reglamentaria a escala de pista de 50 metros de largo por 25 metros de ancho.
- Marcas oficiales: bordes redondeados (r = 3.5m), eje longitudinal, eje transversal, círculos reglamentarios y ubicación del panel de jueces.
- Editor de trayectorias con **Curvas de Bézier cúbicas** interactivas (puntos de anclaje y controladores arrastrables).
- Patinador animado en tiempo real sincronizado con el cursor del audio.
- Mapeo de elementos técnicos directamente sobre las coordenadas de la pista.

### 4. Almacenamiento Local Persistente (IndexedDB)
- 3 Almacenes de Objetos principales según el PRD: `skaters`, `programs`, `elements_log`.
- Protección contra evicción en Safari/iOS mediante `navigator.storage.persist()`.
- Exportación e importación completa en formato JSON para copias de seguridad offline.

---

## 🛠️ Comandos de Desarrollo

```bash
# Iniciar servidor de desarrollo en local (puerto 3000)
npm run dev

# Ejecutar la suite de pruebas unitarias del Motor RollArt
npm test

# Compilar para producción (Typecheck + Vite bundle)
npm run build

# Previsualizar compilación de producción
npm run preview
```

---

## 📂 Estructura del Proyecto

```
SkateCoreo/
├── Especificaciones 1.txt        # PRD Original (Fase MVP v1.0)
├── Informa de investigacion.txt   # Informe Técnico y UX
├── index.html                    # Shell HTML con audio sink invisible
├── public/
│   ├── icon.svg                  # Icono vectorial PWA
│   ├── manifest.webmanifest      # Manifiesto PWA standalone
│   └── sw.js                     # Service Worker offline-first
├── src/
│   ├── App.tsx                   # Aplicación principal y reproductor flotante
│   ├── main.tsx                  # Punto de montaje
│   ├── index.css                 # Estilos Tailwind y animaciones
│   ├── types/
│   │   └── index.ts              # Modelos de datos TypeScript (RollArt, Skater, Program)
│   ├── services/
│   │   ├── db.ts                 # Servicio IndexedDB y Storage Persist
│   │   ├── audioEngine.ts        # Motor Web Audio RAM y mitigaciones WebKit
│   │   ├── rollartEngine.ts      # Motor de Reglas Oficial RollArt
│   │   └── rollartEngine.test.ts # Pruebas unitarias automatizadas (10/10)
│   └── components/
│       ├── Navbar.tsx            # Cabecera, tabs, PWA install y alerta Bluetooth
│       ├── TechnicalPanel.tsx    # Panel técnico One-Tap y Report Card
│       ├── RinkCanvas.tsx        # Lienzo 2D de pista 25x50m con Bézier
│       ├── AudioStudio.tsx       # Estudio de audio con waveform y Factor T
│       └── SkatersManager.tsx    # Gestión de atletas y programas
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

