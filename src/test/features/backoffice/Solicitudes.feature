@backoffice @solicitudes
Feature: Solicitudes de comercio — Back-office de PriceList

  Flujo end-to-end del módulo Solicitudes: se registra un comercio en el PORTAL
  con datos aleatorios (para no chocar con datos ya registrados), y en el
  back-office se valida que TODOS los datos mostrados coincidan con lo registrado
  antes de aprobar o rechazar la solicitud, verificando la transición de estado.
  Cada ejecución crea varios comercios: unos se aprueban y otros se rechazan.

  Background:
    Given un comercio se registra en el portal con datos aleatorios

  @Regresion
  Scenario Outline: Aprobar una solicitud pendiente cuyos datos coinciden (<caso>)
    Given el comercio verifica su correo
    And el admin abre el módulo de Solicitudes del back-office
    Then los datos de la solicitud pendiente coinciden con el comercio registrado
    When el admin aprueba la solicitud
    Then la solicitud aparece en "Aprobadas"
    And la solicitud ya no está en Pendientes

    Examples:
      | caso |
      | 1    |
      | 2    |

  @Regresion
  Scenario Outline: Rechazar una solicitud pendiente cuyos datos coinciden (<caso>)
    Given el admin abre el módulo de Solicitudes del back-office
    Then los datos de la solicitud pendiente coinciden con el comercio registrado
    When el admin rechaza la solicitud con motivo "El RNC declarado no coincide con la razón social ante la DGII."
    Then la solicitud aparece en "Rechazadas"
    And la solicitud ya no está en Pendientes

    Examples:
      | caso |
      | 1    |
      | 2    |
