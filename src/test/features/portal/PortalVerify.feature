@portal @confirmar-correo
Feature: Confirmar correo — Portal de PriceList

  Validación de cliente de la pantalla "Confirma tu correo" (la que aparece tras
  registrar el comercio y al reabrirla desde el login). El campo de correo usa
  las mismas reglas que el registro; el campo de código exige 6 dígitos
  NUMÉRICOS (rechaza letras, alfanumérico y códigos incompletos). Cada caso
  muestra un mensaje claro en español, sin llegar al servidor.

  Background:
    Given el usuario está en la pantalla de confirmar correo del portal

  @Regresion
  Scenario Outline: Confirmar con dato inválido muestra un mensaje claro por campo
    When el usuario intenta confirmar el correo con "<dataId>"
    Then se muestra el error de confirmación esperado para "<dataId>"

    Examples: Correo electrónico
      | dataId             |
      | email-empty        |
      | email-no-at        |
      | email-trailing-dot |
      | email-hash-local   |
      | email-double-at    |
      | email-no-tld       |

    Examples: Código de 6 dígitos
      | dataId            |
      | code-empty        |
      | code-only-spaces  |
      | code-only-letters |
      | code-alphanumeric |
      | code-too-short    |
