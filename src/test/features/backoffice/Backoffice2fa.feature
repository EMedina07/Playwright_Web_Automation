@backoffice @backoffice-2fa
Feature: Verificación en dos pasos (2FA) — Back-office de PriceList

  Validación de cliente del campo de código del autenticador en la pantalla
  "Verificación en dos pasos" del back-office. El código debe ser de 6 dígitos
  NUMÉRICOS: se rechazan letras, alfanumérico, códigos incompletos y vacío, con
  un mensaje claro en español antes de llamar al servidor (no consume TOTP).

  Background:
    Given el admin llega a la pantalla de verificación en dos pasos del back-office

  @Regresion
  Scenario: El código 2FA del back-office rechaza valores no numéricos con mensaje claro
    Then el código 2FA del back-office "abcdef" muestra el error "El código debe ser de 6 dígitos numéricos."
    And el código 2FA del back-office "12ab56" muestra el error "El código debe ser de 6 dígitos numéricos."
    And el código 2FA del back-office "123" muestra el error "El código debe ser de 6 dígitos numéricos."
    And el código 2FA del back-office "" muestra el error "Ingresa el código de 6 dígitos."
