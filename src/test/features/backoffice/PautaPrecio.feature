@backoffice @promociones-ui
Feature: Precio de la publicidad — del back-office al portal y al cobro

  El precio POR DÍA que el admin define en el back-office es la única verdad:
  el portal lo cotiza en vivo (días × precio = total, y el botón "Publicar y
  pagar" muestra ese total), y el cobro que queda en el ledger al publicar es
  exactamente ese monto. De paso, el aviso "Guardado." del back-office confirma
  y se retira solo (pedido del dueño).

  @Regresion @exclusivo
  Scenario: El precio definido en el back-office es el que cotiza el portal
    Given la configuración de la pauta está anotada para restaurarla
    When el admin fija en el back-office el precio de la publicidad en RD$333
    Then el aviso "Guardado." aparece y se retira solo
    When el comercio QA abre Promociones patrocinadas en el portal
    Then la cotización para hoy dice "1 día(s) × RD$333.00/día = RD$333.00"
    When elige una campaña de hoy a dentro de 2 días
    Then la cotización dice "3 día(s) × RD$333.00/día = RD$999.00"
    And el botón de publicar dice "Publicar y pagar RD$999.00"

  @Regresion @exclusivo
  Scenario: El monto cobrado al publicar es días por el precio del admin
    Given la configuración de la pauta está anotada para restaurarla
    And el precio de la pauta quedó en 333 pesos por día
    And el comercio QA abre Promociones patrocinadas en el portal
    When elige una campaña de hoy a dentro de 1 día
    And publica la promoción desde el portal
    Then el cobro registrado en el ledger es de 66600 centavos, acreditado y facturado
