@backoffice @ingresos @api @exclusivo
Feature: Dashboard de ingresos — MRR, Vigentes, Por vencer, Vencidas y Bajas

  Estrés de las 5 tarjetas (A-02). Cada tarjeta se lleva a sus bordes con
  transiciones reales (asignar, renovar, vencer, cancelar) y viajes en el
  tiempo por SQL — los vencimientos viven en fechas y ninguna suite espera un
  mes. Todos los asserts son DELTAS contra una foto previa: la data viva del
  entorno (simulación) no contamina. La vista materializada se refresca bajo
  demanda con el job real. @exclusivo: las tarjetas son estado global.

  # ── MRR y Vigentes ────────────────────────────────────────────────────────

  @Regresion
  Scenario: Asignar PRO suma al MRR el monto facturado por la escala, no el precio base
    Given la foto del dashboard está tomada
    And un comercio QA sin suscripción
    When el admin le asigna PRO por 1 mes
    Then el MRR sube exactamente RD$2000.00 y Vigentes sube 1
    And el monto del MRR cruza con el pago del ledger
    And la suscripción no aparece en "Por vencer" ni en "Vencidas"

  @Regresion
  Scenario: Renovar el mismo plan no duplica la suscripción
    Given la foto del dashboard está tomada
    And un comercio QA con PRO asignado
    When el admin le asigna PRO por 1 mes otra vez
    Then es la MISMA suscripción con el vencimiento extendido
    And Vigentes subió exactamente 1 en total y el MRR exactamente RD$2000.00

  @Regresion
  Scenario: La escala por sucursales gobierna el MRR
    Given la foto del dashboard está tomada
    And un comercio QA con 3 sucursales activas
    When el admin le asigna PRO por 1 mes
    Then el MRR sube exactamente RD$5400.00

  # ── Por vencer (7 días) ───────────────────────────────────────────────────

  @Regresion
  Scenario: La ventana de "Por vencer" es exactamente 7 días
    Given la foto del dashboard está tomada
    And un comercio QA con PRO asignado
    When su vencimiento se mueve a dentro de 6 días y 23 horas
    Then "Por vencer" sube 1 y sigue contando en Vigentes y en el MRR
    When su vencimiento se mueve a dentro de 7 días y 1 hora
    Then "Por vencer" vuelve al valor de la foto

  # ── Vencidas ──────────────────────────────────────────────────────────────

  @Regresion
  Scenario: Al vencer, la suscripción cambia de tarjeta: sale del MRR y entra en Vencidas
    Given la foto del dashboard está tomada
    And un comercio QA con PRO asignado
    When su vencimiento se mueve a ayer
    Then "Vencidas" sube 1, Vigentes vuelve a la foto y el MRR también
    And el panel la pinta "PastDue"

  @Regresion
  Scenario: Renovar una vencida arranca el período desde hoy, no desde el vencimiento viejo
    Given la foto del dashboard está tomada
    And un comercio QA con PRO vencido hace 2 meses
    When el admin le asigna PRO por 1 mes
    Then la suscripción vence en torno a un mes desde hoy
    And "Vencidas" vuelve a la foto y Vigentes sube 1

  # ── Bajas del mes ─────────────────────────────────────────────────────────

  @Regresion
  Scenario: Cancelar cuenta como baja del mes y saca la suscripción de todo lo demás
    Given la foto del dashboard está tomada
    And un comercio QA con PRO asignado
    When el admin cancela su suscripción
    Then "Bajas del mes" sube 1, Vigentes y MRR vuelven a la foto
    And la suscripción desaparece de la tabla del panel
    And cancelarla de nuevo se rechaza

  @Regresion
  Scenario: Una baja del mes pasado no cuenta en este mes
    Given la foto del dashboard está tomada
    And un comercio QA con PRO asignado
    When el admin cancela su suscripción
    And la cancelación se mueve al mes pasado
    Then "Bajas del mes" vuelve al valor de la foto

  @Regresion
  Scenario: Una cancelación técnica jamás facturada no es una baja
    Given la foto del dashboard está tomada
    When aparece la huella de un upgrade con la tarjeta rechazada
    Then "Bajas del mes" queda igual que la foto
    And Vigentes y MRR también quedan igual

  # ── Reglas y consistencia ─────────────────────────────────────────────────

  @Regresion
  Scenario: El plan Gratis no se puede asignar como suscripción
    Given un comercio QA sin suscripción
    When el admin intenta asignarle el plan FREE
    Then la asignación se rechaza mencionando "Gratis"

  @Regresion
  Scenario: Las tarjetas se ponen al día solas tras asignar, sin esperar los 10 minutos
    Given la foto del dashboard está tomada
    And un comercio QA sin suscripción
    When el admin le asigna PRO por 1 mes
    Then sin refresco manual, Vigentes refleja la suscripción nueva en menos de medio minuto
