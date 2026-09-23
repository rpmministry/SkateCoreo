# SkateCoreo · Rediseño profesional del sistema Paper-to-Digital

> Documento de diagnóstico, investigación, arquitectura y plan de implementación.
> Autor: equipo de ingeniería SkateCoreo. Fecha: 2026-09-23.
>
> **Nota de honestidad técnica:** ningún sistema de visión sobre fotografías de mano
> alzada puede garantizar un 100 % de precisión. El objetivo de este rediseño es
> maximizar la robustez en condiciones reales y, sobre todo, **no inventar nodos**:
> todo resultado dudoso se deriva a revisión humana. Las cifras de precisión solo
> deben declararse tras medirlas sobre el conjunto de fotografías reales (sección I).

---

## Índice

- [A. Diagnóstico: por qué falla el sistema actual](#a-diagnóstico)
- [B. Investigación: soluciones gratuitas y open source](#b-investigación)
- [C. Arquitectura recomendada](#c-arquitectura-recomendada)
- [D. Rediseño del scanner](#d-rediseño-del-scanner)
- [E. Cambios necesarios en el PDF](#e-cambios-en-la-plantilla-pdf)
- [F. Algoritmos concretos por etapa](#f-algoritmos-por-etapa)
- [G. Tecnologías](#g-tecnologías)
- [H. Implementación (estructura de código)](#h-implementación)
- [I. Pruebas](#i-pruebas)
- [J. Criterio de aceptación](#j-criterio-de-aceptación)
- [Estado actual: qué se ha implementado ya](#estado-actual-implementado-en-este-cambio)

---

## A. Diagnóstico

El sistema actual (homografía + "truco del marcador") tiene buenas ideas —las 4 marcas
fiduciales, la marca de origen asimétrica y la segmentación de color— pero la
**detección de nodos** es frágil porque toma decisiones sobre la fotografía completa
sin un modelo de la plantilla ni validación geométrica. Causas concretas, con
referencia al código:

1. **Detección de fiduciales poco fiable.**
   `FiducialDetector.detectMarkers` binariza con Otsu global y busca *cualquier* blob
   oscuro con aspecto cuadrangular entre 2 % y 12 % del ancho
   (`FiducialDetector.ts:69-87`). La clasificación posterior usa solo 8 muestras
   radiales (`FiducialDetector.ts:174-213`), muy sensible a desenfoque, sombra y JPEG.
   Si no encuentra la marca sólida, el respaldo ordena por `x + y` y **acepta
   cualesquiera 4 blobs** (`FiducialDetector.ts:101-107`), lo que puede producir una
   homografía completamente errónea sin avisar. `orderCornersFromOrigin` tampoco
   valida que el cuadrilátero tenga proporción 2:1.

2. **Marcas fiduciales sin identidad ni corrección de error.** Las 3 esquinas no-origen
   son idénticas (`pdfTemplateGenerator.ts:382-419`). Solo la forma (sólida vs anillo)
   distingue el origen; no hay código por esquina ni verificación. Un giro/oclusión de
   una marca es indetectable.

3. **Detección de nodos basada solo en color + aspecto.** `PaperColorDetector` aplica
   umbrales HSV fijos (`MIN_SAT = 0.16`) y luego un único filtro de aspecto 0.6–1.6
   (`PaperColorDetector.ts:141-145`). Consecuencias:
   - Una **línea de trayectoria** corta y gruesa, o un trazo con forma de "gancho",
     pasa el filtro y se convierte en nodo falso.
   - Dos nodos unidos por una línea forman **una sola componente alargada** que se
     descarta por aspecto → nodos perdidos.
   - Un **borrón/manchón** de color, o una firma, pasan como nodo.
   - No se comprueba que el trazo sea un **círculo cerrado** ni que tenga interior.

4. **Umbrales atados a la resolución y al área relativa.** `minAreaRatio` 0.2 %–5 %
   del total de la imagen (`PaperColorDetector.ts:160-161`) hace que nodos pequeños se
   pierdan y manchas grandes se ignoren; el "adaptativo" relaja saturación y ensancha
   aspecto (`PaperColorDetector.ts:214-226`), aumentando falsos positivos justo cuando
   ya hay problemas. Todo depende del tamaño de la foto, no de metros de pista.

5. **No existe modelo digital de la plantilla ni sustracción.** No se conoce de
   antemano dónde están rejilla, diagonales, círculo central ni líneas maestras, así
   que no se pueden neutralizar. El color débil que la óptica/JPEG genera junto a las
   líneas negras impresas ("fringe") puede activar la máscara de color.

6. **Segmentación de color sin normalización de iluminación.** El HSV puro falla con
   luz cálida/fría, sombras y reflejos; un rojo oscuro cae por debajo del umbral `V`;
   un gris con dominante de color puede colarse. No hay balance de blancos ni espacio
   perceptual (Lab).

7. **OCR inservible en local y dependencia de pago.** `PaperOcrEngine` intenta Google
   Cloud Vision si hay clave (`PaperOcrEngine.ts:85-167`) —servicio **de pago**, que
   contradice el requisito— y, sin clave, **no lee ningún número**: todos los nodos
   quedan en `sequenceNumber = 0` y el orden es arbitrario. No se recorta el interior
   del nodo ni se restringe el vocabulario a `0-9`.

8. **Todo candidato se convierte en nodo.** El "FAIL-SAFE" del modal crea un nodo por
   cada mancha de color (`PaperToDigitalModal.tsx:326-367`). No hay noción de
   confianza por aspecto ni de cola de revisión; cualquier falso positivo se plasma.

9. **Modo diagnóstico insuficiente.** Solo hay "Nodos" y "Máscara de color"
   (`PaperToDigitalModal.tsx:581-618`); no se ven plantilla detectada, residual,
   candidatos descartados ni el puntaje de cada nodo.

**Conclusión del diagnóstico:** el error de fondo es formular el problema como
*"detectar círculos en una foto"*. El problema correcto es
*"comparar una plantilla conocida con la foto rectificada y encontrar solo la tinta
nueva roja/azul, validando geométricamente que es un nodo"*. Todo el rediseño parte
de ese cambio conceptual.

---

## B. Investigación

Tecnologías evaluadas (todas gratuitas/open source; ninguna exige API de pago).

| Herramienta | Tipo / licencia | Navegador | Servidor propio | Encaje en SkateCoreo | Veredicto |
|---|---|---|---|---|---|
| **ArUco (OpenCV)** | C++/Python, Apache-2.0 | vía WASM | sí | Fiduciales con ID + corrección de error | **Recomendado** |
| **js-aruco2** | JS puro, MIT | **sí** | sí (Node) | Detecta diccionarios ArUco/`ARUCO_MIP_36h12`, genera SVG; sin dependencias pesadas | **Recomendado para navegador** |
| **AprilTag** | C, BSD-2 | WASM no oficial | sí | Muy robusto a desenfoque/escala; port JS menos mantenido | Alternativa fuerte (servidor/WASM) |
| **OpenCV.js** | WASM, Apache-2.0 | sí (~8-10 MB) | no aplica | Clásico completo; el módulo `aruco` **no** viene en el build por defecto | Útil, pesado; usar solo si hace falta |
| **OpenCV (Python/C++)** | Apache-2.0 | no | sí | Rectificación, ECC, morfología, debug por lotes | Recomendado en servidor para lotes |
| **Tesseract.js** | WASM, Apache-2.0 | sí | sí | OCR general; dígitos aislados manuscritos = **débil** | Solo respaldo |
| **Tesseract (nativo)** | Apache-2.0 | no | sí | Igual que arriba, mejor rendimiento | Solo respaldo |
| **PaddleOCR** | Python, Apache-2.0 | no | sí | Excelente texto impreso; manuscrito limitado | No prioritario |
| **EasyOCR** | Python, Apache-2.0 | no | sí | Multilenguaje; dígitos aislados irregulares | No prioritario |
| **ONNX Runtime Web** | MIT | **sí** (WASM/WebGL/WebGPU) | — | Ejecuta una CNN pequeña de dígitos **offline** | **Recomendado para dígitos** |
| **ONNX Runtime (Node)** | MIT | no | sí | Mismo modelo en servidor si se prefiere | Recomendado (opción) |
| **MNIST / EMNIST-Digits** | datasets libres | — | — | Base para entrenar el clasificador 0-9 | **Recomendado** |
| **Canvas / OffscreenCanvas + Web Workers** | web estándar | sí | — | Procesamiento sin bloquear la UI | **Recomendado** |
| **WebAssembly (genérico)** | web estándar | sí | — | Base de OpenCV.js/ORT/Tesseract.js | Soporte |

**Conclusiones de la investigación**

- Para **fiduciales**, la opción gratuita más limpia en navegador es **js-aruco2**
  (ArUco puro en JS, con `ARUCO_MIP_36h12`: 36 bits, distancia mínima de Hamming 12,
  250 códigos, detección en `ImageData`). Alternativa de máxima robustez: **AprilTag**,
  pero su port a navegador es menos maduro; se puede ejecutar en el servidor propio.
  OpenCV.js funcionaría pero su módulo `aruco` requiere build personalizado y añade
  ~8-10 MB; no es la mejor relación beneficio/coste para 4 marcas fijas.
- Para **rectificación**, la homografía ya existe (`HomographyWarp`) y es correcta;
  solo hay que endurecerla (DLT normalizado + RANSAC + validación 2:1).
- Para **segmentación de color**, el estado del arte práctico es **CIELab + umbral
  adaptativo (Otsu) + normalización de iluminación**, no HSV fijo.
- Para **dígitos**, ningún OCR general gana a una **CNN pequeña entrenada para 0-9**
  ejecutada con **ONNX Runtime Web**. Tesseract/Paddle/EasyOCR se reservan como
  respaldo o para texto impreso, no para un dígito manuscrito dentro de un círculo.

---

## C. Arquitectura recomendada

Flujo por etapas, cada una con una responsabilidad única y salida verificable:

```
FOTOGRAFÍA (móvil)
   │
   ▼
[1] DETECCIÓN DE FIDUCIALES ......... ArUco/js-aruco2  → 4 IDs + esquinas
   │
   ▼
[2] ORIENTACIÓN + HOMOGRAFÍA ........ DLT normalizado + RANSAC + validación 2:1
   │
   ▼
[3] RECTIFICACIÓN ................... warpPerspective → 2000×1000 (50×25 m)
   │
   ▼
[4] NORMALIZACIÓN DE ILUMINACIÓN .... white-patch por percentil (canales)
   │
   ▼
[5] SEGMENTACIÓN ROJO/AZUL .......... CIELab: croma + signo de b* (Otsu adaptativo)
   │
   ▼
[6] MODELO DIGITAL DE PLANTILLA ..... geometría impresa conocida (metros)
   │
   ▼
[7] SUSTRACCIÓN DE PLANTILLA ........ residual = tinta − (plantilla dilatada); la
   │                                   tinta de croma alto SIEMPRE sobrevive
   ▼
[8] CANDIDATOS (FASE 1) ............. huecos encerrados + ajuste de círculo (Kasa) +
   │                                   discos rellenos
   ▼
[9] VALIDACIÓN MULTICRITERIO (FASE 2) confianza por color, circularidad, radio,
   │                                   densidad de tinta y posición → accept/review/reject
   ▼
[10] DÍGITO (OCR RESTRINGIDO) ....... recorte INTERIOR → tensor 28×28 → CNN ONNX {0..9}
   │
   ▼
[11] NORMALIZACIÓN A PISTA 2D ....... px → metros (independiente de la resolución)
   │
   ▼
[12] DIGITALIZACIÓN + REVISIÓN ...... nodos aceptados + cola de revisión; trayectoria
                                       editable; reproducción del patinador
```

Regla transversal: **cada etapa solo consume la salida de la anterior** y ninguna
decide "nodo sí/no" por una sola métrica. La etapa [7] es la que materializa el cambio
conceptual: *restar lo que ya conozco*.

---

## D. Rediseño del scanner

### D.1 Fiduciales y orientación (etapas 1-3)

- Sustituir las 4 marcas actuales por **fiduciales codificados** (ver sección E).
  Mientras no se cambie el PDF, mantener el detector actual como *fallback*.
- Con js-aruco2: `detector.detect(imageData)` devuelve `{ id, corners }`. Mapear
  `id → esquina` elimina la ambigüedad de orientación sin heurísticas ni OCR.
- Homografía: DLT **normalizado** (Hartley: trasladar centroide a 0 y escalar a √2)
  y refinar con **RANSAC** sobre las 4 esquinas + control de proporción 2:1 y
  convexidad. Si el error de reproyección supera un umbral (p. ej. > 2 px),
  **no continuar**: pedir re-foto.
- Rectificar a 2000×1000 (40 px/m uniforme). Esto fija la escala: todos los umbrales
  posteriores se expresan en **metros**, no en píxeles de la foto.

### D.2 Modelo digital de la plantilla (etapa 6)

La app conoce la geometría exacta impresa: borde, rejilla de 1 m y 5 m, ejes,
círculo central (r = 3 m), diagonales y marcas de 3/4. Se representa en **metros** y se
rasteriza a la resolución rectificada. Dos usos:

1. **Sustracción**: quitar lo impreso y el fringe cromático asociado.
2. **Protección/validación**: saber si un candidato cae sobre geometría impresa.

### D.3 Sustracción de plantilla (etapa 7)

```
residual = inkMask − dilate(printedMask, r_protección)
residual = residual ∪ strongInkMask        // la tinta de croma alto sobrevive
```

Clave fina: si se resta a ciegas, **un nodo dibujado encima de una línea de rejilla se
rompe** y deja de detectarse. Por eso la tinta "fuerte" (croma alto, trazo real de
marcador) se reincorpora siempre; solo desaparece el **color débil** (fringe de
compresión/óptica) pegado a la plantilla. Esto se validó con pruebas (sección I).

### D.4 Candidatos en dos fases (etapas 8-9)

**Fase 1 — candidatos (no decide):**
1. Cierre morfológico para unir micro-cortes del bolígrafo.
2. **Huecos**: un nodo circular encierra una región de fondo; el centroide del hueco es
   un estimador de centro muy estable, incluso con el círculo deformado o atravesado
   por una línea. Un anillo abierto puede no tener hueco → se cubre con el paso 3.
3. **Ajuste de círculo (Kasa)** para anillos abiertos; se exige radio en rango y RMS
   bajo, de modo que una línea recta (RMS alto o radio enorme) se rechaza.
4. **Discos rellenos**: se detectan por relleno y aspecto ≈ 1 (marcadores).
5. Perfil radial **por primer tramo + mediana** para no inflar el radio por una línea
   de trayectoria que sale del nodo.

**Fase 2 — validación (decide):** cada candidato recibe confidencias independientes
(`colorConfidence`, `circleConfidence`, `positionConfidence`, `inkDensityConfidence`,
`digitConfidence`) y una `overall` por media geométrica ponderada. Reglas duras:
sin color suficiente → rechazo; radio fuera de rango → rechazo; cobertura angular baja
→ revisión o rechazo. Nunca se acepta por una sola métrica.

### D.5 Dígito restringido (etapa 10)

Solo se analiza el **interior** del nodo (disco r < 0,8·radio interior). Se binariza la
tinta interior (más oscura que el papel local), se centra por centro de masas y se
escala a 28×28 (formato MNIST). Un modelo **CNN** la clasifica en `{0..9}` con
confianza; por debajo del umbral devuelve `null`. Esto evita que el número se confunda
con el círculo y reduce el vocabulario al mínimo.

### D.6 Coordenadas y capas

- Todo se calcula sobre la **imagen rectificada**; `px → metros` es lineal y la
  posición es independiente de la resolución de la foto.
- Capas separadas en el lienzo: `Pista · Nodos · Números · Trayectoria · Patinador`.
  Durante la edición el patinador está **oculto por defecto** (o conmutable); en PLAY
  aparece y recorre la trayectoria. El renderizador ya dibuja por capas
  (`RinkRenderer.drawRinkFloor / drawTrajectories / drawAnchorPoints / drawSkaterAvatar`);
  solo hay que añadir el conmutador de la capa del patinador y un `review` visual.

### D.7 Modo diagnóstico

El pipeline devuelve todas las máscaras intermedias (`ScanDebug`) para visualizar:
foto original, rectificada, plantilla detectada, máscara de color, residual tras
sustracción, candidatos, círculos validados, OCR y nodos/trayectoria finales.

---

## E. Cambios en la plantilla PDF

La plantilla actual es funcional pero **no está optimizada para visión artificial**. La
propuesta (fase 2, requiere actualizar el detector a la par para no romper el flujo):

1. **Fiduciales codificados ArUco** (`ARUCO_MIP_36h12`, 4 IDs: `TL/TR/BR/BL`),
   tamaño 18-20 mm, con **zona de silencio blanca de 4-5 mm** aislada. Ventajas: ID
   único, orientación intrínseca, corrección de error y detección robusta con
   js-aruco2, sin depender de la marca sólida ni de heurísticas.
   - Ubicación: en las esquinas de la pista, con la misma lógica anti-solapamiento que
     ya verifican las pruebas del generador.
2. **Plantilla impresa estrictamente acromática dentro de la pista**: negro/gris. Así
   "ROJO/AZUL = usuario" es una regla absoluta. El branding cian/ámbar (cabecera y
   panel de jueces) ya vive **fuera** de la pista y queda recortado por el warp, pero
   conviene moverlo a gris por rigor.
3. **Referencia de tamaño de nodo**: imprimir (fuera de la pista) dos círculos de
   referencia con el **diámetro mínimo y máximo** esperado del nodo manuscrito. Esto
   fija el rango de radio en metros y elimina ambigüedad de escala.
4. **Zonas de calibración opcionales** en el margen (fuera de la pista, por tanto fuera
   del análisis): parches de referencia neutro/rojo/azul para auto-calibrar el
   segmentador. No son imprescindibles si se usa el modelo digital.
5. **Instrucciones**: precisar que los nodos se dibujan con círculo **cerrado** (o casi)
   y número dentro; que la trayectoria puede unirse a los círculos, pero los nodos son
   los círculos.

**¿Conviene cambiar el PDF? Sí, pero de forma coordinada.** El cambio de fiduciales da
la mayor ganancia de fiabilidad del sistema; debe hacerse junto con el nuevo detector.
Mientras tanto, el scanner v2 funciona con la plantilla actual (fiduciales actuales +
modelo digital + segmentación Lab + validación), lo que permite una migración por
fases sin dejar la app sin funcionar.

---

## F. Algoritmos por etapa

| Etapa | Algoritmo recomendado | Alternativas descartadas |
|---|---|---|
| Fiduciales | ArUco `ARUCO_MIP_36h12` (js-aruco2) | plantilla de correlación, Hough de cuadrados |
| Homografía | DLT normalizado + RANSAC + validación 2:1 | DLT simple (sensible al ruido) |
| Rectificación | `warpPerspective` con mapeo inverso bilineal (ya existe) | interpolación nearest |
| Iluminación | white-patch por percentil de canal (96 %) | ecualización global (destruye color) |
| Color | **CIELab**: croma = √(a*²+b*²), Otsu adaptativo, signo de b* (rojo/azul), umbral de croma fuerte | HSV fijo, `pixel == rojo` |
| Plantilla | rasterización de geometría conocida + dilatación + sustracción preservando croma alto | template matching por correlación (sensible a luz) |
| Candidatos | componentes conexas + **huecos encerrados** + ajuste de círculo Kasa + relleno/aspecto | HoughCircles, `findContours` global |
| Validación | confianzas multicriterio + media geométrica + reglas duras | un único umbral |
| Dígito | CNN 28×28 en `{0-9}` vía ONNX Runtime Web | Tesseract (débil en manuscrito aislado) |
| Posición | px → metros (lineal) sobre imagen rectificada | coordenadas de la foto original |

Detalles de robustez de color/geometría:

- **Robustez cromática**: Lab separa color de luminancia; el croma es invariante a
  sombras/iluminación moderada. El signo de `b*` separa rojo (`b*>0`) de azul
  (`b*<0`) aunque ambos tengan `a*` positivo.
- **Robustez geométrica**: el hueco encerrado no depende de que el círculo sea
  perfecto; el ajuste de círculo cuantifica deformación; el perfil radial por mediana
  resiste líneas de trayectoria y trazos sucios.
- **Falsos positivos**: se atacan en tres capas (color → plantilla → validación) y aun
  así lo dudoso va a **revisión**, nunca a aceptación silenciosa.

---

## G. Tecnologías

**Núcleo (ya en el proyecto):** TypeScript, Canvas 2D, React + Zustand, jsPDF.

**Añadir (todas gratuitas):**

- **js-aruco2** (MIT) para fiduciales ArUco en navegador; alternativa **AprilTag**
  (BSD-2) en servidor.
- **onnxruntime-web** (MIT) para la CNN de dígitos; modelo exportado desde PyTorch/
  TensorFlow y cuantizado (INT8) para que pese pocos cientos de KB.
- **Web Workers + OffscreenCanvas** para no bloquear la UI (la segmentación de una
  foto de 2000×1000 es la parte más costosa).
- **Tesseract.js** (Apache-2.0) **solo** como respaldo opcional.
- **Servidor propio (opcional):** OpenCV/Python para lotes y depuración; PaddleOCR/
  EasyOCR solo si en el futuro se quiere OCR de texto impreso. Nunca APIs de pago.

**No usar:** Google Cloud Vision ni cualquier API de pago como camino principal.

---

## H. Implementación

### H.1 Estructura de código propuesta

```
src/core/vision/
├── HomographyWarp.ts                 (existente; endurecer con DLT normalizado)
├── FiducialDetector.ts               (existente; fallback hasta migrar a ArUco)
├── fiducials/
│   └── ArucoFiducialDetector.ts      [NUEVO] adaptador js-aruco2 → QuadCorners
├── scan/                             [NUEVO · implementado en este cambio]
│   ├── types.ts                      tipos puros del pipeline (sin DOM)
│   ├── ImageOps.ts                   morfología, etiquetado, huecos, círculo, perfil
│   ├── TemplateModel.ts              modelo digital + rasterizado + distancias
│   ├── InkSegmentation.ts            CIELab + Otsu adaptativo + croma fuerte
│   ├── TemplateSubtractor.ts          sustracción preservando tinta fuerte
│   ├── NodeCandidateDetector.ts      fase 1 (huecos + círculo + discos)
│   ├── NodeValidator.ts              fase 2 (confianzas + decisión)
│   ├── DigitClassifier.ts            tensor 28×28 + adaptador ONNX + fallback
│   ├── PaperScanner.ts               orquestador (async) + debug
│   └── paperScanner.test.ts          pruebas automáticas
├── adapters/
│   ├── PaperScannerCanvas.ts         [NUEVO] ImageData ↔ scan/* (sin lógica)
│   └── paperScanner.worker.ts        [NUEVO] ejecuta scanPaper en Web Worker
└── diagnostics/
    └── ScanDiagnostics.ts            [NUEVO] convierte ScanDebug en canvas/imágenes
```

Principio de diseño: **`scan/*` es puro** (recibe `RgbaImage`, devuelve máscaras y
datos; sin `document`). Eso lo hace ejecutable en **Node** (pruebas), en **Web Worker**
y en el **servidor**, y evita el acoplamiento que hoy mezcla detección con UI.

### H.2 Integración en SkateCoreo (pasos)

1. **Adaptador Canvas** `PaperScannerCanvas.ts`:
   ```ts
   import { scanPaper } from '../scan/PaperScanner';
   import { QuadCorners, HomographyWarp } from '../HomographyWarp';

   export async function scanWarpedCanvas(
     warped: HTMLCanvasElement,
     rink = DEFAULT_RINK
   ) {
     const ctx = warped.getContext('2d')!;
     const { data, width, height } = ctx.getImageData(0, 0, warped.width, warped.height);
     return scanPaper({ width, height, data }, { rink });
   }
   ```
2. **Modal**: sustituir `PaperOcrEngine.detectNumberedNodesWithDebug` por
   `scanPaper` vía el adaptador; mapear `ScannedNode[]` → `ChoreographyPoint[]`
   (mismo formato que hoy) marcando `unrecognized = digit === null || review`.
3. **Cola de revisión**: `nodes.filter(n => n.review)` se resaltan en la Pista 2D
   (hoy ya existe el estado naranja `unrecognized` en `RinkRenderer.drawAnchorPoints`);
   añadir además la posición de los **candidatos rechazados** en el diagnóstico.
4. **Números**: si `digit !== null` → `nodeNumber`; si no, `label = '?'` y edición
   manual con doble clic (comportamiento actual).
5. **Capas**: conmutador `showSkater` en el store, por defecto `false` en edición y
   `true` en PLAY; `RinkRenderer.drawSkaterAvatar` ya se invoca solo si hay avatar.
6. **Web Worker**: mover `scanWarpedCanvas` a `paperScanner.worker.ts` con
   `postMessage({buffer})` para no congelar la UI; transferir el `ArrayBuffer`.
7. **Diagnóstico**: pestañas que rendericen `ScanDebug` (plantilla, color, residual,
   candidatos, validados, OCR).

### H.3 Compatibilidad y migración

- El pipeline v2 sustituye la detección, pero **reutiliza** homografía, modal y
  modelo de datos; no exige migrar datos guardados.
- Migración por fases: (a) activar `scan/v2` tras el warp actual; (b) añadir ArUco y
  cambiar el PDF; (c) entrenar y enchufar la CNN de dígitos. Cada fase es reversible
  mediante un flag.

---

## I. Pruebas

### I.1 Pruebas automáticas ya implementadas

`src/core/vision/scan/paperScanner.test.ts` (36 aserciones, todas en verde) cubre, con
hojas sintéticas controladas:

| # | Escenario | Resultado esperado |
|---|---|---|
| 1 | Segmentación rojo/azul vs gris/blanco | rojo/azul aislados; rejilla y papel excluidos |
| 2 | Modelo digital | rasteriza rejilla en su posición; mide distancia |
| 3 | Sustracción | elimina fringe junto a líneas; conserva tinta lejana |
| 4 | 1 anillo rojo | 1 candidato centrado y clasificado rojo |
| 5 | 1 nodo | aceptado, posición (10.5, 8.5) m |
| 6 | 5 nodos (3 rojos, 2 azules) | 5/5, canales correctos |
| 7 | Nodos sin número | se detectan; `digit = null` (no se inventa) |
| 8 | Trayectoria unida a nodos | 2 nodos, la línea no genera nodos |
| 9 | Círculo abierto (con gap) | detectado, canal azul |
| 10 | Disco relleno | detectado |
| 11 | Dos nodos próximos | se mantienen separados (2) |
| 12 | Plantilla impresa sola | 0 nodos (anti-falso-positivo) |
| 13 | Tensor de dígito | 28×28; detecta/no detecta tinta correctamente |
| 14 | Adaptador ONNX | reconoce 7; sin evidencia devuelve `null` |
| 15 | Trayectoria que ATRAVIESA el círculo | 1 solo nodo, centrado (fusión de huecos) |

> Estas pruebas garantizan el comportamiento **algorítmico** con imágenes controladas.
> **No** sustituyen a la validación con fotografías reales.

### I.2 Matriz de pruebas con fotografías reales (obligatoria antes de declarar cifras)

Capturar un conjunto etiquetado y medir precision/recall por nodo, error de posición y
exactitud de dígito. Escenarios mínimos:

- 1, 5 y 10 nodos; nodos numerados y sin número.
- Tinta roja y azul (clara/oscura); distintos bolígrafos/marcadores.
- Nodos muy próximos; nodos sobre líneas de rejilla; nodos sobre el círculo central.
- Foto inclinada con perspectiva fuerte; rotaciones 90/180/270.
- Luz baja, exceso de luz, sombras duras, reflejos; papel ligeramente doblado.
- Trayectoria que atraviesa círculos; círculos abiertos; círculos rellenos.
- Casos de falsos positivos: manchones, anotaciones de texto, colores de fondo.

Métricas: precisión, recall, F1 por nodo; error de posición medio (m); exactitud del
dígito; tasa de nodos enviados a revisión. **Umbral de salida a producción:** alta
precisión a costa de mandar más casos a revisión (nunca al revés).

---

## J. Criterio de aceptación

Un nodo se acepta **automáticamente** solo si se cumplen **todas** estas condiciones:

1. `colorConfidence ≥ 0.5` (tinta roja o azul claramente dominante en el anillo).
2. `circleConfidence` alto: cobertura angular suficiente (≥ ~0.7) y ajuste circular con
   RMS bajo.
3. Radio dentro del rango esperado definido por la plantilla (metros).
4. `inkDensityConfidence` suficiente (trazo continuo, no un trazo tenue o discontinuo).
5. Posición dentro de la pista y `overall ≥ umbral` (por defecto 0.70).

En cualquier otro caso:

- `review` → se muestra al usuario para confirmar/editar (nunca se descarta en
  silencio un posible nodo).
- `reject` → evidencia insuficiente; no se crea nodo (nunca se inventa).

Además: el número se acepta solo si el clasificador supera su umbral de confianza; si
no, el nodo se crea con `digit = null` y se marca para edición manual, **sin asignar un
número arbitrario**.

---

## Estado actual (implementado en este cambio)

- ✅ Nuevo pipeline puro `src/core/vision/scan/*` (11 archivos): segmentación CIELab
  adaptativa, modelo digital de plantilla, sustracción con preservación de croma
  fuerte, detección de candidatos por huecos/círculo/relleno, validación
  multicriterio con confianzas, extracción de dígito 28×28 y adaptador ONNX, y
  orquestador con máscaras de diagnóstico.
- ✅ 36 pruebas automáticas nuevas, integradas en `npm test`, todas en verde.
- ✅ `tsc --noEmit` sin errores.
- ✅ Correcciones tras revisión de código: se fusionan los huecos de un mismo
  círculo cuando una línea lo atraviesa (un nodo ya no se duplica), la circularidad
  se mide con ajuste real al contorno (no se supone), y se eliminan costes
  O(K·n)/asignaciones por candidato en el etiquetado, la recolección de píxeles y el
  perfilado de anillos.
- ⏳ **Pendiente (fase 2):** sustituir la detección actual en el modal por `scanPaper`
  a través del adaptador/worker, modo diagnóstico completo, conmutador de capa del
  patinador, fiduciales ArUco + cambio de PDF, y entrenamiento del modelo de dígitos.
- 🚫 **No implementado a propósito:** no se ha modificado el gráfico de las marcas
  fiduciales del PDF para no romper el detector actual mientras el nuevo scanner no
  esté conectado a la UI. La migración de fiduciales se entrega como propuesta (E) y
  debe hacerse de forma coordinada.

> Recordatorio: no se declara ningún porcentaje de precisión sin la campaña de
> fotografías reales de la sección I.2. El diseño prioriza **no inventar nodos**
> sobre aceptar más, tal como exige el requisito.
