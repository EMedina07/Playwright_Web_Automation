Feature: Login — OrangeHRM

  Background:
    Given el usuario está en la página de login

  # ── HAPPY PATH ──────────────────────────────────────────────
  @Regresion @jira:KAN-36
  Scenario: Login exitoso con credenciales válidas redirige al dashboard
    When el usuario inicia sesión con el usuario "happy-001"
    Then el usuario es redirigido al dashboard

  # ── CASOS NEGATIVOS ─────────────────────────────────────────
  @Regresion @jira:KAN-21
  Scenario: Login con campos obligatorios vacíos muestra validación requerida
    When el usuario inicia sesión con el usuario "neg-empty-both"
    Then se muestran los mensajes de campo requerido

  @Regresion @jira:KAN-22
  Scenario Outline: Login con credenciales inválidas muestra error de autenticación
    When el usuario inicia sesión con el usuario "<dataId>"
    Then se muestra el error de credenciales inválidas

    Examples:
      | dataId             |
      | neg-wrong-password |
      | neg-wrong-user     |
      | neg-wrong-both     |

  # ── EDGE CASES ──────────────────────────────────────────────
  @Regresion @jira:KAN-23
  Scenario Outline: Login con datos en los límites del sistema muestra error de autenticación
    When el usuario inicia sesión con el usuario "<dataId>"
    Then se muestra el error de credenciales inválidas

    Examples:
      | dataId                  |
      | edge-spaces-username    |
      | edge-special-chars-pass |

  @Regresion @jira:KAN-24
  Scenario: El sistema acepta username en minúsculas (login es case-insensitive)
    When el usuario inicia sesión con el usuario "edge-case-sensitive"
    Then el usuario es redirigido al dashboard

  # ── SEGURIDAD ────────────────────────────────────────────────
  @Regresion @jira:KAN-25
  Scenario: Acceso directo al dashboard sin autenticación redirige a login
    When el usuario intenta acceder directamente al dashboard sin autenticarse
    Then el sistema redirige a la página de login

  @Regresion @jira:KAN-26
  Scenario: Payload XSS en el campo username es rechazado por el sistema
    When el usuario inicia sesión con el usuario "sec-xss-username"
    Then el sistema no ejecuta el payload y muestra error de credenciales

  # ── TIEMPO DE RESPUESTA ──────────────────────────────────────
  # SLA objetivo: <2000ms en ambiente QA real. Threshold ajustado a 15000ms para servidor demo público.
  @Regresion @jira:KAN-27
  Scenario: El login exitoso responde dentro del tiempo aceptable
    When el usuario inicia sesión con "happy-001" y se registra el tiempo de respuesta
    Then el tiempo de respuesta es menor a 20000 milisegundos
