@backoffice
Feature: Login — Back-office de PriceList

  Pruebas negativas y de borde del login del back-office. Cubren la validación
  de cliente (formato de email, campos requeridos) y la respuesta del servidor
  (credenciales inválidas genéricas, sin filtrar existencia de la cuenta).

  Background:
    Given el usuario está en la página de login del back-office

  # ── HAPPY PATH ──────────────────────────────────────────────
  @Regresion
  Scenario: Credenciales válidas avanzan al paso de verificación en dos pasos
    When el usuario del back-office inicia sesión con "happy-admin"
    Then el sistema avanza al paso de verificación en dos pasos

  @Regresion @Sesion
  Scenario: El admin inicia sesión con 2FA y entra al back-office
    When el usuario del back-office inicia sesión con "happy-admin"
    Then el sistema avanza al paso de verificación en dos pasos
    And el admin completa la verificación en dos pasos con "happy-admin"
    And el admin entra al back-office con "happy-admin"

  # ── VALIDACIÓN DE CAMPOS REQUERIDOS (cliente) ────────────────
  @Regresion
  Scenario: Campos vacíos muestran el mensaje de requerido en ambos campos
    When el usuario del back-office inicia sesión con "neg-empty-both"
    Then se muestra el error de email esperado para "neg-empty-both"
    And se muestra el error de contraseña esperado para "neg-empty-both"

  Scenario Outline: Un campo obligatorio vacío muestra su mensaje de requerido
    When el usuario del back-office inicia sesión con "<dataId>"
    Then se muestran los mensajes de validación esperados para "<dataId>"

    Examples:
      | dataId             |
      | neg-empty-email    |
      | neg-empty-password |
      | neg-only-spaces    |

  # ── VALIDACIÓN DE FORMATO DE EMAIL (cliente) ─────────────────
  @Regresion
  Scenario Outline: Email con formato inválido se rechaza en el cliente con mensaje claro
    When el usuario del back-office inicia sesión con "<dataId>"
    Then se muestra el error de email esperado para "<dataId>"

    Examples:
      | dataId                     |
      | edge-email-no-at           |
      | edge-email-slash           |
      | edge-email-spaces-internal |
      | edge-email-double-at       |
      | edge-email-trailing-at     |
      | edge-email-no-tld          |

  # ── SEGURIDAD ────────────────────────────────────────────────
  @Regresion
  Scenario: Un payload de script en el email se rechaza por formato y no se ejecuta
    When el usuario del back-office inicia sesión con "sec-xss-email"
    Then el sistema no ejecuta el payload y muestra el error de email para "sec-xss-email"

  Scenario: Una cadena de inyección en el email se rechaza por formato inválido
    When el usuario del back-office inicia sesión con "sec-sqli-email"
    Then se muestra el error de email esperado para "sec-sqli-email"

  # ── CREDENCIALES INVÁLIDAS (servidor, genérico) ──────────────
  @Regresion
  Scenario Outline: Email con formato válido pero credenciales incorrectas muestra error genérico
    When el usuario del back-office inicia sesión con "<dataId>"
    Then se muestra el error de formulario esperado para "<dataId>"

    Examples:
      | dataId                          |
      | neg-wrong-password              |
      | neg-nonexistent-email           |
      | edge-email-uppercase-wrong-pass |
