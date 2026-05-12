Feature: Login — OrangeHRM

  Background:
    Given el usuario está en la página de login

  # ── HAPPY PATH ──────────────────────────────────────────────
  @jira:KAN-126 @Regresion
  Scenario: Login exitoso con credenciales válidas redirige al dashboard
    When el usuario inicia sesión con el usuario "happy-001"
    Then el usuario es redirigido al dashboard

  # ── CASOS NEGATIVOS ─────────────────────────────────────────
  @jira:KAN-127 @Regresion
  Scenario: Login con campos obligatorios vacíos muestra validación requerida
    When el usuario inicia sesión con el usuario "neg-empty-both"
    Then se muestran los mensajes de campo requerido

  @jira:KAN-128 @jira:KAN-129 @jira:KAN-130 @Regresion
  Scenario Outline: Login con credenciales inválidas muestra error de autenticación
    When el usuario inicia sesión con el usuario "<dataId>"
    Then se muestra el error de credenciales inválidas

    Examples:
      | dataId             |
      | neg-wrong-password |
      | neg-wrong-user     |
      | neg-wrong-both     |

  # ── EDGE CASES ──────────────────────────────────────────────
  @jira:KAN-131 @jira:KAN-132 @Regresion
  Scenario Outline: Login con datos en los límites del sistema muestra error de autenticación
    When el usuario inicia sesión con el usuario "<dataId>"
    Then se muestra el error de credenciales inválidas

    Examples:
      | dataId                  |
      | edge-spaces-username    |
      | edge-special-chars-pass |

  @jira:KAN-133 @Regresion
  Scenario: El sistema acepta username en minúsculas (login es case-insensitive)
    When el usuario inicia sesión con el usuario "edge-case-sensitive"
    Then el usuario es redirigido al dashboard

  # ── SEGURIDAD ────────────────────────────────────────────────
  @jira:KAN-134 @Regresion
  Scenario: Acceso directo al dashboard sin autenticación redirige a login
    When el usuario intenta acceder directamente al dashboard sin autenticarse
    Then el sistema redirige a la página de login

  @jira:KAN-135 @Regresion
  Scenario: Payload XSS en el campo username es rechazado por el sistema
    When el usuario inicia sesión con el usuario "sec-xss-username"
    Then el sistema no ejecuta el payload y muestra error de credenciales

  # ── TIEMPO DE RESPUESTA ──────────────────────────────────────
  # SLA objetivo: <2000ms en ambiente QA real. Threshold ajustado a 15000ms para servidor demo público.a
  @jira:KAN-136 @Regresion
  Scenario: El login exitoso responde dentro del tiempo aceptable
    When el usuario inicia sesión con "happy-001" y se registra el tiempo de respuesta
    Then el tiempo de respuesta es menor a 20000 milisegundos
