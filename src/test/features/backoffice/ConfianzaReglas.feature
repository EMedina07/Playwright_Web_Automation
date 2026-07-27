@backoffice @confianza @api
Feature: Confianza de comercios — reglas de suspensión, casos negativos y edge

  Verificación a nivel de API de las reglas de auto-suspensión (umbrales y
  anti-abuso), casos negativos de validación, y casos límite. Incluye dos
  escenarios @bug que documentan defectos REALES detectados analizando el código
  (quedan en rojo hasta que se decida el arreglo).

  # ── Reglas de umbral ──────────────────────────────────────────────────────

  @Regresion
  Scenario: Dos personas no suspenden aunque reporten muchos productos
    Given un comercio de prueba activo y publicado
    And el comercio publica 8 productos más
    When 2 consumidores reportan "no coincidió" en todos los productos publicados
    Then se registraron al menos 5 reportes
    And el comercio sigue activo

  @Regresion
  Scenario: Cuatro reportes de cuatro consumidores aún no suspenden
    Given un comercio de prueba activo y publicado
    When 4 consumidores distintos reportan "no coincidió"
    Then el comercio sigue activo

  @Regresion
  Scenario: El quinto reporte de un quinto consumidor suspende
    Given un comercio de prueba activo y publicado
    When 5 consumidores distintos reportan "no coincidió"
    Then el comercio queda suspendido

  @Regresion
  Scenario: Cinco reportes de solo dos consumidores no suspenden
    Given un comercio de prueba activo y publicado
    And el comercio publica 8 productos más
    When 2 consumidores reportan 5 productos distintos cada uno
    Then el comercio sigue activo

  @Regresion
  Scenario: Los reportes de "sí coincidió" no cuentan para suspender
    Given un comercio de prueba activo y publicado
    When 6 consumidores distintos reportan "sí coincidió"
    Then el comercio sigue activo
    And el panel no lista al comercio con quejas

  @Regresion
  Scenario: El mismo teléfono re-registrado no cuenta como reportante nuevo
    Given un comercio de prueba activo y publicado
    And un consumidor reporta y luego elimina su cuenta
    When re-crea la cuenta con el mismo teléfono y vuelve a reportar el mismo producto
    Then el segundo reporte no se registra
    And el panel cuenta un solo reportante

  # ── Casos negativos de validación ─────────────────────────────────────────

  @Regresion
  Scenario: Reportar sin sesión se rechaza
    Given un comercio de prueba activo y publicado
    When se reporta sin sesión de consumidor
    Then el reporte se rechaza con 401

  @Regresion
  Scenario: Reportar un producto que el comercio no publica se rechaza
    Given un comercio de prueba activo y publicado
    When un consumidor reporta un producto que el comercio no publica
    Then el reporte se rechaza

  @Regresion
  Scenario Outline: Un precio visto inválido se rechaza (<caso>)
    Given un comercio de prueba activo y publicado
    When un consumidor reporta con precio visto <precio>
    Then el reporte se rechaza

    Examples:
      | caso        | precio  |
      | cero        | 0       |
      | negativo    | -5      |
      | exagerado   | 1000000 |

  @Regresion
  Scenario: Suspender sin motivo se rechaza
    Given un comercio de prueba activo y publicado
    When el admin intenta suspender al comercio sin motivo
    Then la moderación se rechaza

  @Regresion
  Scenario: Reactivar un comercio que ya está activo se rechaza
    Given un comercio de prueba activo y publicado
    When el admin intenta reactivar un comercio ya activo
    Then la moderación se rechaza

  @Regresion
  Scenario: Moderar un comercio inexistente se rechaza
    When el admin intenta suspender un comercio inexistente
    Then la moderación se rechaza

  # ── Más casos negativos / edge (destapan defectos) ────────────────────────

  @Regresion
  Scenario: Cinco reportes de exactamente 3 consumidores distintos suspenden
    Given un comercio de prueba activo y publicado
    And el comercio publica 8 productos más
    When 3 consumidores distintos generan 5 reportes de "no coincidió"
    Then el comercio queda suspendido

  @Regresion
  Scenario: Suspender un comercio ya suspendido se rechaza
    Given un comercio de prueba activo y publicado
    And el comercio queda suspendido por el admin
    When el admin intenta suspender al comercio de nuevo
    Then la moderación se rechaza

  @Regresion
  Scenario: Reactivar reinicia el ciclo — los reportes previos ya no cuentan
    Given un comercio de prueba activo y publicado
    And el comercio se auto-suspende por 5 reportes de 3 consumidores distintos
    When el admin reactiva al comercio
    And 4 consumidores distintos reportan "no coincidió"
    Then el comercio sigue activo

  @Regresion
  Scenario Outline: Un precio visto en el límite válido se acepta (<caso>)
    Given un comercio de prueba activo y publicado
    When un consumidor reporta con precio visto válido <precio>
    Then el reporte se acepta

    Examples:
      | caso     | precio |
      | mínimo   | 1      |
      | máximo   | 999999 |

  # ── Regresiones de defectos ya corregidos (antes en rojo, ahora en verde) ──

  @Regresion @bug
  Scenario: [BUG-1] Un comercio suspendido no puede subir precios por su API key
    Given un comercio de prueba activo y publicado
    And el comercio queda suspendido por el admin
    When el comercio intenta subir precios por su API key en el Canal A
    Then el canal de ingesta debería rechazar el lote del comercio suspendido

  @Regresion @bug
  Scenario: [BUG-2] Un "coincidió" no tapa un "no coincidió" del mismo día
    Given un comercio de prueba activo y publicado
    And un consumidor reporta que el precio "sí coincidió"
    When el mismo consumidor reporta que el precio "no coincidió" el mismo día
    Then el reporte de "no coincidió" debería quedar registrado

  @Regresion @bug
  Scenario: [BUG-3] Un comercio suspendido no puede recibir reportes de caja
    Given un comercio de prueba activo y publicado
    And el comercio queda suspendido por el admin
    When un consumidor reporta al comercio suspendido
    Then el reporte se rechaza

  @Regresion @bug
  Scenario: [BUG-4] Cinco cuentas desde el MISMO dispositivo no suspenden
    Given un comercio de prueba activo y publicado
    When 5 consumidores distintos reportan "no coincidió" desde el mismo dispositivo
    Then el comercio sigue activo

  @Regresion @bug
  Scenario: [BUG-5] Pagar menos que lo publicado no cuenta contra el comercio
    Given un comercio de prueba activo y publicado
    When un consumidor reporta "no coincidió" pagando menos que lo publicado
    Then el reporte no queda registrado
