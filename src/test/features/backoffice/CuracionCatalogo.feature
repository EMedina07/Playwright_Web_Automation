@backoffice @catalogo @api
Feature: Curación de catálogo — auto-creación, curación, sinónimos y cobertura

  Verificación a nivel de API del módulo de curación (el servidor es la capa
  de cumplimiento; la pantalla solo refleja estas reglas): la cola de curación
  que alimentan las cargas de comercios, la integridad de datos al curar, las
  reglas de sinónimos (forma, unicidad y conteo honesto contra el buscador
  real) y la aritmética de la cobertura de precios que el admin lee como
  "N de N productos tienen al menos un precio fresco".

  # ── Auto-creación → cola → curar (el ciclo completo) ──────────────────────

  @Regresion
  Scenario: Un GTIN nuevo entra a la cola y curarlo lo saca sin tocar su identidad
    Given un comercio QA activo con API key
    When el comercio publica un producto con GTIN nuevo y nombre "Cafe Curacion QA"
    Then el lote reporta 1 producto auto-creado
    And el producto aparece en la cola de curación
    And el buscador del consumidor ya lo encuentra
    When el admin lo cura con nombre "Café Curación QA 454 g", marca "QA" y categoría "BEBIDAS"
    Then el producto sale de la cola de curación
    And el buscador lo encuentra con el nombre curado
    And su GTIN no cambió

  @Regresion
  Scenario: Un GTIN con dígito verificador incorrecto no fabrica ficha
    Given un comercio QA activo con API key
    When el comercio publica un producto con GTIN inválido
    Then el lote reporta 0 productos auto-creados y 1 línea a revisión

  @Regresion
  Scenario: El mismo GTIN repetido en el lote crea UNA sola ficha
    Given un comercio QA activo con API key
    When el comercio publica dos líneas con el mismo GTIN nuevo
    Then el lote reporta 1 producto auto-creado y 2 precios publicados

  # ── Integridad de datos al curar ──────────────────────────────────────────

  @Regresion
  Scenario Outline: Curar con un nombre sin forma de producto se rechaza (<caso>)
    Given un producto auto-creado pendiente de curación
    When el admin intenta curarlo con nombre <nombre>
    Then la curación se rechaza mencionando "nombre"

    Examples:
      | caso           | nombre     |
      | solo números   | "12345"    |
      | solo símbolos  | "@#$%&*"   |
      | una sola letra | "A"        |

  @Regresion
  Scenario: Curar con nombre de dos letras entre dígitos se acepta (edge "7UP")
    Given un producto auto-creado pendiente de curación
    When el admin lo cura con nombre "7UP" y categoría "BEBIDAS"
    Then la curación se acepta

  @Regresion
  Scenario: Curar con una marca sin letras se rechaza
    Given un producto auto-creado pendiente de curación
    When el admin intenta curarlo con marca "123"
    Then la curación se rechaza mencionando "marca"

  @Regresion
  Scenario: Curar con una presentación de solo símbolos se rechaza
    Given un producto auto-creado pendiente de curación
    When el admin intenta curarlo con presentación "---"
    Then la curación se rechaza mencionando "presentación"

  @Regresion
  Scenario: Curar con un nombre de más de 200 caracteres se rechaza
    Given un producto auto-creado pendiente de curación
    When el admin intenta curarlo con un nombre de 201 caracteres
    Then la curación se rechaza

  @Regresion
  Scenario: Curar con una categoría inexistente se rechaza
    Given un producto auto-creado pendiente de curación
    When el admin intenta curarlo con categoría "NO_EXISTE"
    Then la curación se rechaza mencionando "categoría"

  @Regresion
  Scenario: Curar con una subcategoría inexistente se rechaza
    Given un producto auto-creado pendiente de curación
    When el admin intenta curarlo con subcategoría "NO_EXISTE"
    Then la curación se rechaza mencionando "subcategoría"

  @Regresion
  Scenario: Curar un producto inexistente se rechaza
    When el admin intenta curar el producto 999999999
    Then la curación se rechaza mencionando "no existe"

  @Regresion
  Scenario: Curar sin sesión de admin se rechaza
    When se intenta curar un producto sin token de admin
    Then la petición se rechaza con 401

  # ── Sinónimos de búsqueda ─────────────────────────────────────────────────

  @Regresion
  Scenario: Un sinónimo válido nace con un conteo honesto frente al buscador real
    When el admin crea el sinónimo "colgateqa" para "pasta dental"
    Then el sinónimo aparece listado con su conteo de productos
    And el conteo coincide con el buscador del consumidor y con el detalle
    And al eliminarlo desaparece de la lista

  @Regresion
  Scenario Outline: Un término o sinónimo sin letras se rechaza (<caso>)
    When el admin intenta crear el sinónimo <termino> para <sinonimo>
    Then el sinónimo se rechaza

    Examples:
      | caso                | termino       | sinonimo       |
      | término numérico    | "/888998888"  | "Leche"        |
      | término de símbolos | "@#$"         | "arroz"        |
      | sinónimo numérico   | "Leche"       | "12345"        |
      | término de 1 letra  | "a"           | "arroz"        |

  @Regresion
  Scenario: Un término vinculado a sí mismo se rechaza aunque cambie mayúsculas o espacios
    When el admin intenta crear el sinónimo "Leche" para "  leche "
    Then el sinónimo se rechaza

  @Regresion
  Scenario: Un término no puede registrarse dos veces, ni disfrazado con tildes
    When el admin crea el sinónimo "cepilloqa" para "pasta dental"
    Then intentar crear "cepilloqa" de nuevo se rechaza
    And intentar crear "cepílloqa" con tilde también se rechaza
    And al eliminarlo desaparece de la lista

  @Regresion
  Scenario: Un término de más de 80 caracteres se rechaza
    When el admin intenta crear un sinónimo con término de 81 caracteres
    Then el sinónimo se rechaza

  # ── Cobertura de precios (el texto "N de N productos…") ───────────────────

  @Regresion
  Scenario: La aritmética de la cobertura siempre cuadra
    Then la cobertura cumple: con precio + sin precio = total, y el detalle lista exactamente los sin precio

  @Regresion
  Scenario: Un producto nuevo con precio de un comercio activo entra CUBIERTO
    Given un comercio QA activo con API key
    And la cobertura actual está anotada
    When el comercio publica un producto con GTIN nuevo y nombre "Avena Cobertura QA"
    Then el total de productos subió en 1 sin abrir huecos nuevos

  @Regresion
  Scenario: Un producto sin precio abre un hueco y la primera publicación lo cierra
    Given un comercio QA activo con API key
    And la cobertura actual está anotada
    When el admin crea a mano un producto fresco sin precio
    Then la cobertura muestra 1 producto más sin precio y lo lista en el detalle
    When el comercio publica ese producto fresco por nombre
    Then la cobertura vuelve a cuadrar sin ese hueco
