@backoffice @recetas @exclusivo
Feature: Recetas del dueño — la integración admin↔comercio vista por pantalla

  Las tres recetas de verificación manual del dueño, automatizadas TAL CUAL se
  hacen a mano: leyendo las tarjetas de la pantalla de Ingresos, operando en
  la de Planes y en el portal del comercio, y cuadrando contra la Auditoría de
  facturación (el ledger expuesto en modo lectura). Data limpia: cada
  escenario aprovisiona su comercio QA y borra su rastro al salir. @exclusivo:
  las tarjetas y el precio de la pauta son estado global.

  @Regresion
  Scenario: Receta 1 — la suscripción hecha en el portal se ve en las tarjetas y cuadra con la auditoría
    El admin ya NO asigna ni cancela planes (decisión del dueño): el comercio
    autogestiona desde su portal — activa Pro con su tarjeta en archivo y la
    baja nace de su clic en "Volver al plan Gratis". La cancelada NO
    desaparece del panel: queda como rastro con estado Canceled.

    Given un comercio QA con tarjeta para la receta
    And las tarjetas de Ingresos están anotadas desde la pantalla
    When el comercio activa Pro desde su portal con la tarjeta en archivo
    Then en Ingresos, en segundos: el MRR sube 2000, Vigentes 1 y las suscripciones del mes 2000
    And en la auditoría el primer pago de suscripción es "RD$2,000.00" "Succeeded" del comercio
    And en la auditoría la primera factura de suscripción del comercio está "Paid"
    When el comercio vuelve al plan Gratis desde su portal
    Then en Ingresos, en segundos: Bajas del mes sube 1 y el MRR y Vigentes vuelven a lo anotado
    And el pago sigue en la auditoría aunque la suscripción se canceló
    And su suscripción queda listada como "Canceled" en la tabla de Planes

  @Regresion
  Scenario: Receta 2 — la campaña pagada en el portal del comercio llega a los ingresos del admin
    Given la configuración de la pauta está anotada para restaurarla
    And el precio de la pauta quedó en 400 pesos por día
    And un comercio QA con tarjeta para la receta
    And las tarjetas de Ingresos están anotadas desde la pantalla
    When el comercio abre sus promociones en el portal
    And elige una campaña de hoy a dentro de 1 días
    Then la cotización dice "2 día(s) × RD$400.00/día = RD$800.00"
    When publica la promoción desde el portal
    Then en Ingresos, en segundos: la publicidad del mes sube 800
    And en la auditoría el primer pago de publicidad es "RD$800.00" "Succeeded" del comercio

  @Regresion
  Scenario: Receta 3 — el total del mes siempre es la suma de las dos fuentes en pantalla
    Given las tarjetas de Ingresos están anotadas desde la pantalla
    Then el Total del mes de la pantalla es exactamente Suscripciones más Publicidad
