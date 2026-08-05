@backoffice @promociones-ui
Feature: Botones de desactivar y reactivar promociones — en pantalla

  Los botones reales de las DOS pantallas (el contrato del API ya lo cubre la
  suite @promociones): en el back-office, Desactivar exige motivo en el modal
  y Reactivar deshace cualquier desactivación; en el portal, Desactivar pide
  confirmación nativa (la campaña ya está pagada), Reactivar solo existe para
  lo que el comercio desactivó ÉL, y una moderación se muestra como tal, sin
  botón.

  # ── Back-office (admin) ───────────────────────────────────────────────────

  @Regresion
  Scenario: El admin desactiva con motivo y el botón cambia a Reactivar
    Given una promoción vigente de un comercio QA
    And el admin abre la moderación de promociones
    When el admin pulsa Desactivar y confirma con motivo "QA: prueba de botones"
    Then la tarjeta muestra la promoción "Desactivada" con el botón Reactivar

  @Regresion
  Scenario: Cancelar el motivo deja la promoción activa
    Given una promoción vigente de un comercio QA
    And el admin abre la moderación de promociones
    When el admin pulsa Desactivar pero cancela el motivo
    Then la tarjeta muestra la promoción "Activa" con el botón Desactivar

  @Regresion
  Scenario: El botón Reactivar del admin revive la promoción
    Given una promoción vigente de un comercio QA
    And el admin abre la moderación de promociones
    When el admin pulsa Desactivar y confirma con motivo "QA: para reactivarla"
    And el admin pulsa Reactivar
    Then la tarjeta muestra la promoción "Activa" con el botón Desactivar

  # ── Portal (comercio) ─────────────────────────────────────────────────────

  @Regresion
  Scenario: El comercio desactiva aceptando la confirmación y puede reactivar
    Given una promoción vigente de un comercio QA
    And el comercio abre sus promociones en el portal
    When el comercio pulsa Desactivar y acepta la confirmación
    Then el portal muestra la promoción "Desactivada" con el botón Reactivar del comercio
    When el comercio pulsa Reactivar
    Then el portal muestra la promoción "Activa"

  @Regresion
  Scenario: Rechazar la confirmación deja la campaña pagada activa
    Given una promoción vigente de un comercio QA
    And el comercio abre sus promociones en el portal
    When el comercio pulsa Desactivar pero rechaza la confirmación
    Then el portal muestra la promoción "Activa"

  @Regresion
  Scenario: Una moderación del admin no ofrece Reactivar al comercio
    Given una promoción vigente de un comercio QA
    And el admin la desactivó por moderación
    When el comercio abre sus promociones en el portal
    Then el portal muestra la promoción "Desactivada" sin botón Reactivar y con el aviso de moderación
