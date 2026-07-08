# Análisis — Personalización del reporte (Cucumber + Playwright)

> Objetivo: determinar qué se puede modificar en el reporte de ejecución (presentación,
> estructura, contenido adicional: imágenes, evidencias, estilos, secciones), qué NO,
> las limitaciones técnicas y las alternativas, con una recomendación y validación práctica.

---

## 1. Cómo funciona el reporte hoy (lo que montamos)

El reporte HTML lo genera **multiple-cucumber-html-reporter** a partir del JSON de Cucumber.
La evidencia visual por paso (la tarjeta `#5 ASSERT … ✅ … expect(locator).toBeVisible()`)
**no** es una función nativa del reporter: la construimos nosotros y se la "inyectamos" como
un adjunto HTML. La cadena es:

```
Acción del Page Object (fillField / clickElement / assertVisible …)
   │  BasePage toma un screenshot (Buffer PNG)
   ▼
StepLogger.renderCard()  →  genera HTML autocontenido:
   · badge con nº de paso y tipo (FILL/CLICK/ASSERT…)
   · descripción + ícono ✅/❌
   · bloque de código (lo que se ejecutó)
   · <img src="data:image/png;base64,…">  ← el screenshot embebido
   ▼
this.attach(card, 'text/html')      ← World de Cucumber
   ▼
reports/cucumber-report.json         ← embedding { mime_type:'text/html', data: base64 }
   ▼
multiple-cucumber-html-reporter      ← inyecta ese HTML tal cual DEBAJO del paso
   ▼
reports/html/…  (la tarjeta que ves)
```

**Clave del diseño:** en vez de depender del render nativo (limitado), generamos **HTML propio
con CSS inline + imagen en base64** y lo adjuntamos como `text/html`. El reporter lo inserta
verbatim, así que controlamos casi por completo la presentación de cada paso.

### Tipos de adjunto que el reporter sabe renderizar

(Confirmado en `node_modules/multiple-cucumber-html-reporter/lib/generate-report.js`, `_parseSteps`)

| mime_type | Cómo lo muestra | Uso en el framework |
|---|---|---|
| `text/html` | Inyecta el HTML tal cual bajo el paso | **Tarjetas de evidencia** (renderCard, timing, skipped) |
| `image/png` | `<img>` con la imagen | (disponible; hoy la imagen va dentro del HTML) |
| `video/webm` | `<video>` embebido | (disponible; hoy el video se guarda en disco) |
| `text/plain` | Texto escapado | Ruta del PDF de evidencia, URL al fallar, logs de consola |
| `application/json` | Bloque JSON | (disponible) |

---

## 2. Capacidades de personalización

Hay **dos niveles** independientes.

### Nivel A — Contenido por paso / escenario (control máximo, vía `attach`)

Todo lo que podamos expresar en **HTML autocontenido** lo podemos mostrar por paso:

- Badges, colores, íconos de estado, layout, tipografías (inline).
- El screenshot (base64), el código ejecutado, tablas, barras (ej. `renderTimingCard` para SLA).
- Tarjetas especiales: paso omitido (`renderSkippedCard`), timing, etc.
- Cualquier evidencia adicional: otra imagen, un diff, una tabla de datos, un panel de error.

Esto es lo que ya usamos y es **lo más flexible**: no dependemos del reporter para el "qué se ve".

### Nivel B — Reporte global (opciones de `report.generate` en `report.ts`)

| Opción | Qué permite |
|---|---|
| `reportName`, `pageTitle` | Título y nombre del reporte |
| `pageFooter` | HTML propio al pie de todas las páginas (branding, créditos) |
| `customData` | Bloque "Run info": proyecto, release, ambiente, ejecutor, fecha (**ya lo usamos**) |
| `customMetadata` | Metadatos personalizados adicionales |
| `metadata` | Chips de entorno (browser / device / platform) |
| `customStyle` | **Inyecta un CSS propio a TODO el reporte** → look & feel (colores, fuentes, logo por CSS) |
| `overrideStyle` | Reemplaza por completo la hoja de estilos base |
| `displayDuration`, `displayReportTime` | Mostrar duración / hora |
| `hideMetadata` | Ocultar el bloque de metadatos |
| `useCDN` | Cargar jQuery/Bootstrap/Chart desde CDN (evita copiar assets; requiere internet al abrir) |
| `staticFilePath` | Nombres de assets estables (sin hash) |

---

## 3. Elementos modificables vs NO modificables

| Elemento | ¿Modificable? | Cómo |
|---|---|---|
| Evidencia por paso (imagen, código, badges, colores) | ✅ Total | `attach` de HTML (renderCard) |
| Screenshots / imágenes | ✅ | base64 en el HTML, o adjunto `image/png` |
| Video del escenario | ✅ (posible) | adjunto `video/webm` (hoy se guarda en disco) |
| Información de ejecución (proyecto, ambiente, ejecutor, fecha) | ✅ | `customData` / `customMetadata` |
| Look & feel global (colores, fuentes, logo) | ✅ | `customStyle` / `overrideStyle` |
| Pie de página / branding | ✅ | `pageFooter` |
| Título, nombre, metadatos | ✅ | `reportName`, `pageTitle`, `metadata` |
| **Estructura del dashboard** (columnas de la tabla, layout de páginas) | ⚠️ Limitado | Solo editando/forkeando los `.tmpl` del paquete (frágil) |
| **Los 2 gráficos doughnut** (tipo/colores/estados) | ❌ (por opción) | Fijos en la plantilla (Chart.js v2); requiere forkear plantilla |
| **JavaScript propio dentro de las tarjetas** | ❌ | El reporter inyecta HTML/CSS estático; no ejecuta scripts de los adjuntos |
| Interactividad avanzada por paso | ❌ | Igual que arriba (solo HTML/CSS + base64) |

---

## 4. Limitaciones técnicas encontradas

1. **HTML autocontenido obligatorio:** los adjuntos no pueden depender de CSS/JS/fuentes externas.
   Todo va inline o en base64. Por eso las tarjetas usan **estilos inline** (además, evita que un
   CSS con selectores amplios rompa el layout del reporter).
2. **Sin scripts en los adjuntos:** no se puede añadir interactividad propia por paso.
3. **Estructura del reporter fija:** el layout, la tabla de features y los charts vienen de sus
   plantillas. Cambiarlos implica forkear (`feature-overview.index.tmpl`, etc.), que no es mantenible.
4. **Assets locales:** el reporter copia jQuery/Bootstrap/Chart.js a `reports/html/assets`. En
   carpetas sincronizadas (OneDrive) esa copia puede fallar → reporte sin estilos/gráficos.
   *Mitigado en el framework:* `report.ts` copia los assets como red de seguridad y limpia
   `reports/html` antes de generar. Alternativa: `useCDN: true`.
5. **Charts no configurables por API:** son Chart.js v2 con estados/colores fijos.

---

## 5. Alternativas disponibles

| Opción | Personalización | Esfuerzo | Cuándo usarla |
|---|---|---|---|
| **Opciones del reporter actual** (`customStyle`, `customData`, `pageFooter`, `metadata`) | Media-alta a nivel look&feel e info | Bajo | Branding + info de ejecución (recomendado hoy) |
| **Adjuntos `text/html`** (nuestra técnica) | Máxima para el contenido por paso | Bajo (ya hecho) | Evidencia visual rica por paso |
| **Forkear plantillas del reporter** | Alta (estructura) | Alto / frágil | Solo si es imprescindible cambiar el layout |
| **@cucumber/html-formatter** (HTML oficial de Cucumber) | Media, moderno, un archivo, soporta attachments y timeline | Bajo | Reporte oficial, robusto, menos "dashboard" |
| **Allure** (`allure-cucumberjs`) | **Muy alta**: pasos, attachments, severidad, categorías de fallo, labels, historial y tendencias | Medio | Reportería avanzada / CI / análisis histórico |
| **Reporte HTML propio** desde `cucumber-report.json` | Total | Alto | Necesidad muy específica de branding/estructura |
| **PDF por escenario** (`PdfReporter`, ya implementado) | Total (lo generamos nosotros) | Ya hecho | Evidencia portable/formal por caso |

---

## 6. Recomendación

1. **Mantener lo actual** (multiple-cucumber-html-reporter + adjuntos `text/html`): ya entrega
   imágenes, pasos, código y estado por paso, con look propio por tarjeta.
2. **Explotar las opciones nativas** para el resto:
   - `customStyle` → colores/fuentes/logo corporativo del reporte.
   - `customData` → info de ejecución (ya activo).
   - `pageFooter` → branding.
   - `useCDN: true` como alternativa si no se quiere depender de la copia de assets.
3. **Si se requiere reportería avanzada** (historial, tendencias, categorización de fallos,
   severidad, dashboards CI): **migrar a Allure** (`allure-cucumberjs`). Es la opción más
   personalizable y estándar de industria; la evidencia actual (attachments) se mapea directo.
4. El **PDF por escenario** ya cubre la evidencia portable/formal y es 100% nuestro.

**En una frase:** el reporte es altamente personalizable en *contenido por paso* (vía adjuntos
HTML) y en *look&feel/info* (vía opciones del reporter); lo único rígido es la *estructura del
dashboard y los charts*. Si eso importa, Allure es el siguiente paso.

---

## 7. Validación práctica (ejemplo con modificaciones)

Sobre el reporte real de `LoginOrangeDemo` ya se evidencia:

- **Imágenes / evidencia:** 5 tarjetas con screenshot base64 (Given 1, When 3, Then 1),
  cada una con badge, código y ✅/❌ — es exactamente la tarjeta `#5 ASSERT … ✅`.
- **Información adicional:** bloque "Run info" (`customData`) con Proyecto, Release, Ambiente,
  SDET Engineer y fecha de ejecución.

Y como demostración de **look & feel** se agregaron (archivos de ejemplo, editables):

- `core/reports/report-theme.css` → inyectado con `customStyle` (acento de color, tipografía,
  banda superior).
- `core/reports/report-footer.html` → inyectado con `pageFooter` (branding al pie).

Ambos se cablean en `report.ts`. Para verlos: correr `npm run test:qa` y abrir el reporte con
**recarga forzada (Ctrl+Shift+R)**. Para quitarlos, basta con borrar esas dos líneas de `report.ts`.
