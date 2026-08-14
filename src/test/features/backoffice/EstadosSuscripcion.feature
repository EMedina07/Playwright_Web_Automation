@backoffice @planes @estados
Feature: Estados de suscripción — la tabla del panel dice la verdad

  El estado no se asigna a mano: se DEDUCE de fechas y contadores. La tabla de
  Suscripciones tiene que distinguir los cuatro estados reales del dominio —
  Active (al día), PastDue (venció o falló un cobro, en ventana de reintentos),
  Suspended (tres reintentos agotados, Pro bloqueado) y Canceled (baja
  explícita, que NO desaparece del panel: queda como rastro al final). Las
  suscripciones se crean por el flujo real y los estados se montan en base de
  datos — nadie puede esperar un mes de verdad en una suite.

  @Regresion
  Scenario: Active, PastDue, Suspended y Canceled se muestran tal cual son
    Given cuatro comercios QA con suscripción Pro activada por API
    When en base de datos al segundo se le vence el período con un cobro fallido
    And en base de datos al tercero se le agotan los tres reintentos
    And en base de datos al cuarto se le cancela la suscripción
    Then la tabla de Suscripciones muestra al primero como "Active"
    And la tabla de Suscripciones muestra al segundo como "PastDue"
    And la tabla de Suscripciones muestra al tercero como "Suspended"
    And la tabla de Suscripciones muestra al cuarto como "Canceled"
