@backoffice @confianza
Feature: Confianza de comercios — suspensión y reactivación (Back-office)

  Flujo integrado del módulo de Confianza: se provisiona un comercio real
  (registro → verificación → aprobación → precio publicado), se generan reportes
  de caja, y desde el back-office el admin lo suspende o reactiva. Se valida la
  sincronización entre el panel del admin, el portal de comercios (login) y lo
  que la app puede mostrar (recomendaciones).

  @Regresion
  Scenario: Suspender manualmente un comercio desde el panel de confianza
    Given un comercio de prueba activo y publicado
    And el comercio recibe 2 reportes de caja de 2 consumidores
    When el admin abre la pantalla de Confianza
    And el admin abre el detalle del comercio
    And el admin suspende al comercio con motivo "QA: precios no coinciden en caja"
    Then el panel muestra al comercio como "Suspended"
    And el comercio suspendido no puede entrar al portal de comercios
    And la app ya no puede mostrar al comercio

  @Regresion
  Scenario: Reactivar un comercio auto-suspendido limpia su detalle en el panel
    Given un comercio de prueba activo y publicado
    And el comercio se auto-suspende por 5 reportes de 3 consumidores distintos
    When el admin abre la pantalla de Confianza
    And el admin reactiva al comercio desde el detalle
    Then el comercio desaparece de la lista de confianza
    And el comercio reactivado sí puede entrar al portal de comercios
    And la app vuelve a poder mostrar al comercio
