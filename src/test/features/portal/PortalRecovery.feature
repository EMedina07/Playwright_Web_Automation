@portal @recuperacion
Feature: Recuperación de verificación de correo — Portal de PriceList

  Cubre el caso "me registré y cerré la pantalla sin poner los 6 dígitos":
  el comercio debe poder volver a la confirmación desde el login, reenviarse un
  código nuevo y confirmar su correo — sin quedar atascado ni tener que
  registrarse otra vez (el correo es único).

  @Regresion
  Scenario: El comercio recupera la verificación tras cerrar la pantalla
    Given un comercio se registra pero no confirma su correo
    When el comercio cierra la pantalla sin ingresar el código
    And reabre la confirmación desde el login y reenvía el código
    Then puede confirmar su correo con el código reenviado
