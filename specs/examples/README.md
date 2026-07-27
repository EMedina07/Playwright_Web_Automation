# Ejemplos de spec

Plantillas listas para aprender cada patrón. Copia la que necesites, ajústala y genera:

```bash
npm run new:module -- specs/examples/iniciar.spec.json
```

| Archivo | Qué enseña |
|---|---|
| [`iniciar.spec.json`](iniciar.spec.json) | **Básico**: login paso a paso con acciones atómicas (`fill`, `click`, assert) y datos por `dataId`. Un step por acción. |
| [`agrupar-acciones.spec.json`](agrupar-acciones.spec.json) | **Composite**: agrupa varias acciones en UN solo step, usando **un** registro de datos. Ideal para formularios. |
| [`scenario-outline.spec.json`](scenario-outline.spec.json) | **Scenario Outline**: recorre **toda** la colección de datos (una corrida por registro). El campo `status` excluye registros (`skip`, `inactive`, …). |

Todos apuntan al demo de OrangeHRM (`https://opensource-demo.orangehrmlive.com`), así que corren tal cual con `HEADLESS=true npm run test:qa` después de generarlos.

Referencia completa de campos: [`../../docs/GENERATOR.md`](../../docs/GENERATOR.md).
