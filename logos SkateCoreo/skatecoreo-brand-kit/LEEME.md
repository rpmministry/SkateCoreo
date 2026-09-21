# SkateCoreo · kit de logotipos

Seis propuestas (A–F) exportadas en SVG y PNG, con todas sus variantes, iconos de app y favicon.
Todo es vector puro: el nombre está convertido a curvas a partir de IBM Plex Sans, así que ningún archivo depende de una fuente instalada.
`vista-general.png` muestra todas las propuestas juntas.

## Qué hay en cada carpeta

| Carpeta | Contenido |
|---|---|
| `web/` | Favicon, iconos de app, manifest, imágenes para compartir (Open Graph) y el fragmento de `<head>`. Basado en la propuesta A. |
| `A-trayectoria/logotipo/` | Nombre en Plex Sans Regular con la S trazada como primera letra. Versión principal. |
| `A-trayectoria/logotipo-trazo-fino/` | Igual, en Plex Sans Light. Para tamaños grandes. |
| `A-trayectoria/logotipo-monolinea/` | Alternativa: todo el nombre dibujado con el mismo trazo que la S, sin tipografía. |
| `A-trayectoria/logotipo-monolinea-fino/` | La alternativa anterior con trazo más ligero. |
| `A-trayectoria/isotipo/` | La S sola. |
| `B` a `F` / `logotipo-horizontal/` | Isotipo + nombre en Plex Sans. |
| `B` a `F` / `isotipo/` | Solo el símbolo. |
| Cada propuesta / `iconos-app/` | Iconos cuadrados, favicon y variantes de app. |

Cada carpeta tiene `svg/` (vectores) y `png/` (fondo transparente).
Tamaños PNG: logotipos a 512, 1024 y 2048 px de ancho; isotipos a 128, 256, 512 y 1024 px.

## Peso tipográfico de cada propuesta

| Propuesta | Nombre |
|---|---|
| A | Regular (fino: Light), con la S trazada |
| B | "Skate" en Light y "Coreo" en Bold |
| C | Todo en minúsculas, Medium |
| D | Bold |
| E | Regular |
| F | Light |

En A la S trazada solo funciona bien en Light y Regular: con pesos más gruesos los huecos de la S se cierran y el nodo se empasta.

## Variantes (sufijo del archivo)

| Sufijo | Úsalo sobre | Colores |
|---|---|---|
| `-color` | Fondo claro | Trazo #161616, nodo #0F62FE |
| `-reverso` | Fondo oscuro | Trazo #FFFFFF, nodo #4589FF |
| `-negro` | Una sola tinta, fondo claro | Todo #161616 |
| `-blanco` | Una sola tinta, fondo oscuro | Todo #FFFFFF |

## Iconos de app (`iconos-app/`)

- `tile-oscuro` y `tile-claro`: icono con esquinas redondeadas, en SVG y PNG (1024 y 512).
- `favicon.svg`, `favicon.ico` (16, 32 y 48 px) y `favicon-16/32/48.png`.
- `apple-touch-icon.png` (180 px, cuadrado completo, sin transparencia).
- `icon-192.png` e `icon-512.png` (Android y PWA).
- `icon-maskable-512.png` (cuadrado completo con margen de seguridad, para iconos adaptables).

## Cómo ponerlo en la web

1. Copia el contenido de `web/` a la raíz pública del sitio.
2. Pega `web/head-snippet.html` dentro del `<head>`.
3. `site.webmanifest` ya apunta a los iconos de 192, 512 y maskable.

## Recomendaciones de uso

- Ancho mínimo del logotipo: 96 px en pantalla. Por debajo de eso, usa el isotipo.
- Isotipo: legible desde 16 px. Las propuestas A, B y D son las que mejor resisten ese tamaño; C, E y F pierden detalle.
- Deja alrededor un margen libre al menos igual a la altura de la "o".
- Para impresión, usa siempre los SVG.
- El azul del nodo es el único color de acento. No lo cambies por otro color en las variantes de una tinta.
- IBM Plex Sans se distribuye bajo licencia SIL Open Font License 1.1, que permite usarla en logotipos.
