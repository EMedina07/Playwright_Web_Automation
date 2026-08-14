@portal @plan @ciclovida
Feature: Ciclo de vida del plan Pro — renovaciones, fallos, bajas y bordes del cobro

  Lo que le pasa a una suscripción DESPUÉS del primer cobro: renovaciones que
  recalculan la escala, reintentos que recuperan un PastDue, bajas del comercio
  ("Volver al plan Gratis"), reembolsos auditados, suspensiones que bloquean
  de verdad y el tramo negociado que no se cobra solo. Los viajes en el tiempo
  van por base de datos y el job de cobros se dispara bajo demanda — nadie
  espera un mes de verdad en una suite.

  @Regresion
  Scenario: La renovación recalcula el precio con la sucursal agregada después de suscribirse
    Given un comercio QA por API con 2 sucursales y tarjeta en archivo
    And activó Pro por API pagando 3600 pesos
    When agrega una sucursal más por API
    And su período vence y corre el job de cobros
    Then su suscripción queda "Active" en el panel de Planes
    And en la auditoría del back-office su pago de suscripción es de 5400 pesos y está "Succeeded"

  @Regresion
  Scenario: Un PastDue se recupera solo cuando el reintento cobra
    Given un comercio QA por API con 1 sucursales y tarjeta en archivo
    And activó Pro por API pagando 2000 pesos
    When en base de datos su suscripción queda vencida con un cobro fallido
    And el reintento ya toca y corre el job de cobros
    Then su suscripción queda "Active" en el panel de Planes
    And su contador de cobros fallidos queda en cero

  @Regresion
  Scenario: Sin tarjeta en archivo, activar Pro exige agregar una tarjeta
    Given un comercio QA por API con 1 sucursales y sin tarjeta
    When el comercio entra al portal y abre su pestaña Plan
    Then no existe el botón de usar tarjeta en archivo
    And "Cambiar a Pro" abre el formulario para agregar tarjeta

  @Regresion
  Scenario: Doble clic en activar Pro no genera doble cobro
    Given un comercio QA por API con 1 sucursales y tarjeta en archivo
    When el comercio entra al portal y abre su pestaña Plan
    And activa Pro haciendo doble clic en usar tarjeta en archivo
    Then el ledger registra exactamente 1 pagos de suscripción del comercio
    And el comercio tiene 1 suscripciones: 0 canceladas y 1 abiertas

  @Regresion
  Scenario: Cancelar y re-suscribirse deja el historial completo: una baja y una activa
    Given un comercio QA por API con 1 sucursales y tarjeta en archivo
    When el comercio entra al portal y abre su pestaña Plan
    And activa Pro con la tarjeta en archivo desde el portal
    And vuelve al plan Gratis desde el portal
    And activa Pro con la tarjeta en archivo desde el portal
    Then el comercio tiene 2 suscripciones: 1 canceladas y 1 abiertas
    And el ledger registra exactamente 2 pagos de suscripción del comercio

  @Regresion
  Scenario: Un reembolso queda auditado: pago Refunded y su hecho en el journal
    Given un comercio QA por API con 1 sucursales y tarjeta en archivo
    And activó Pro por API pagando 2000 pesos
    When el admin reembolsa ese pago por API
    Then en la auditoría del back-office su pago de suscripción es de 2000 pesos y está "Refunded"
    And en el journal del back-office queda el hecho "PAYMENT_REFUNDED" del comercio

  @Regresion
  Scenario: La suspensión bloquea las funciones Pro de verdad
    Given un comercio QA por API con 1 sucursales y tarjeta en archivo
    And activó Pro por API pagando 2000 pesos
    Then su analítica Pro responde por API
    When en base de datos su suscripción queda suspendida por reintentos agotados
    Then su analítica Pro es rechazada por API con el aviso de plan

  @Regresion @exclusivo
  Scenario: Un tramo negociado sin precio pactado no se cobra solo
    Given los tramos del plan Pro están anotados para restaurarlos
    And el tramo de 21 o más sucursales queda en modo Negociado
    And un comercio QA por API con 25 sucursales y tarjeta en archivo
    When el comercio entra al portal y abre su pestaña Plan
    Then el portal avisa que su precio es negociado y no deja activar Pro
