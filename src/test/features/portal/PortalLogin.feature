@portal @portal-login
Feature: Login — Portal de comercios de PriceList

  Validación de cliente del inicio de sesión del portal. Cubre campos requeridos
  y formato de correo (mismos criterios que el registro): rechaza correos sin @,
  sin dominio/TLD, con punto final sobrante, caracteres no permitidos y espacios,
  y exige contraseña. Cada caso muestra un mensaje claro en español sin llegar al
  servidor.

  Background:
    Given el usuario está en el login del portal de comercios

  @Regresion
  Scenario Outline: Login con dato inválido muestra un mensaje claro por campo
    When el comercio intenta iniciar sesión con "<dataId>"
    Then se muestra el error de login esperado para "<dataId>"

    Examples: Correo electrónico
      | dataId               |
      | email-empty          |
      | email-only-spaces    |
      | email-no-at          |
      | email-trailing-dot   |
      | email-hash-local     |
      | email-internal-space |
      | email-double-at      |
      | email-no-tld         |

    Examples: Contraseña
      | dataId         |
      | password-empty |
