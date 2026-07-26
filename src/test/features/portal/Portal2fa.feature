@portal @portal-2fa
Feature: Verificación en dos pasos (2FA) — Portal de PriceList

  Validación de cliente del campo de código del autenticador en la pantalla
  "Verificación en dos pasos". El código debe ser de 6 dígitos NUMÉRICOS: se
  rechazan letras, alfanumérico, códigos incompletos y vacío, con un mensaje
  claro en español antes de llamar al servidor. Requiere un comercio aprobado
  (se monta por los endpoints reales) para llegar a la pantalla.

  Background:
    Given existe un comercio aprobado en la pantalla de verificación en dos pasos

  @Regresion
  Scenario: El código 2FA rechaza valores no numéricos con mensaje claro
    Then el código 2FA "abcdef" muestra el error "El código debe ser de 6 dígitos numéricos."
    And el código 2FA "12ab56" muestra el error "El código debe ser de 6 dígitos numéricos."
    And el código 2FA "123" muestra el error "El código debe ser de 6 dígitos numéricos."
    And el código 2FA "" muestra el error "Ingresa el código de 6 dígitos."
