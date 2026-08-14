@backoffice @ingresos @tarjetas
Feature: Tarjetas del dashboard — el monto nunca se sale de la tarjeta

  Con montos grandes el número se salía de la tarjeta (bug reportado por el
  dueño). Ahora el monto parte del tamaño grande del CSS y, si no cabe, se
  encoge en la proporción exacta — completo, en una sola línea, dentro de su
  tarjeta, a cualquier ancho de pantalla. El monto gigante se monta inflando
  por base de datos el monto facturado de una suscripción QA (la vara del
  MRR), como cualquier viaje en el tiempo de la suite.

  @Regresion
  Scenario: Un MRR de decenas de millones cabe completo en su tarjeta
    Given un comercio QA con una suscripción de monto gigante de 21000000 pesos al mes
    When el admin abre la pantalla de Ingresos
    Then la tarjeta del MRR muestra al menos 21000000 pesos
    And ninguna tarjeta del dashboard tiene el monto desbordado

  @Regresion
  Scenario: En pantalla angosta las tarjetas se re-encogen y nada se desborda
    Given un comercio QA con una suscripción de monto gigante de 21000000 pesos al mes
    When el admin abre la pantalla de Ingresos
    And la pantalla se angosta a 375 píxeles
    Then ninguna tarjeta del dashboard tiene el monto desbordado
