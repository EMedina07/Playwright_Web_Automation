@portal @subida
Feature: Subida de precios por Excel — el mapeo suma y la revisión aparece

  Los dos bugs que la tester reportó por WhatsApp, clavados con pruebas de
  regresión: (1) guardar un mapeo de columnas hacía que la PROPIA plantilla
  estándar se rechazara — el mapeo debe AGREGAR reconocimiento, nunca
  quitarlo; (2) lo enviado a revisión sin sugerencia no aparecía en "Pendientes de
  revisión" — el lote decía "1 en revisión" y la pantalla salía vacía. Los
  .xlsx son fixtures versionados del repo; cada escenario aprovisiona su
  comercio limpio.

  @Regresion
  Scenario: Con mapeo guardado publican tanto los encabezados propios como la plantilla estándar
    Given un comercio QA por API con 1 sucursales y sin tarjeta
    When el comercio entra al portal y abre Importar productos
    And guarda el mapeo de columnas sku "Identificador Producto" y precio "Precio Venta"
    And sube el archivo de precios "encabezados-propios.xlsx"
    Then la carga publica 1 precios y deja 0 en revisión
    When sube el archivo de precios "plantilla-estandar.xlsx"
    Then la carga publica 1 precios y deja 0 en revisión

  @Regresion
  Scenario: Lo que cae a revisión SE VE en Pendientes de revisión aunque no tenga sugerencia, y se puede descartar
    Given un comercio QA por API con 1 sucursales y sin tarjeta
    When el comercio entra al portal y abre Importar productos
    And sube el archivo de precios "sin-codigo-barras.xlsx"
    Then la carga publica 0 precios y deja 1 en revisión
    When abre la pestaña Pendientes de revisión
    Then el producto "NOM-1" aparece listado como "producto sin identificar"
    When descarta el producto "NOM-1"
    Then no queda nada por revisar

  @Regresion
  Scenario: El ítem sin match ofrece el camino directo y confirmarlo lo publica como producto nuevo
    El nombre del producto es único por corrida (vía Canal A): si fuera fijo,
    la segunda corrida lo encontraría ya publicado y el fuzzy lo vincularía
    solo — el escenario dejaría de probar el camino de confirmación.

    Given un comercio QA por API con 1 sucursales y sin tarjeta
    And le llega por API una línea de precio sin código de barras y con nombre inédito
    When el comercio entra al portal y abre Importar productos
    And abre la pestaña Pendientes de revisión
    Then su producto inédito ofrece el botón de confirmar como producto nuevo
    When lo confirma como producto nuevo
    Then no queda nada por revisar

  @Regresion
  Scenario: Las filas incompletas se avisan en vez de perderse en silencio
    Given un comercio QA por API con 1 sucursales y sin tarjeta
    When el comercio entra al portal y abre Importar productos
    And sube el archivo de precios "filas-incompletas.xlsx"
    Then la carga publica 1 precios y deja 0 en revisión
    And el aviso de omisiones menciona el precio vacío y el código faltante
