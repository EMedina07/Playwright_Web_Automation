@portal @registro
Feature: Registro de comercio — Portal de PriceList

  Validación de cliente del formulario "Registrar mi comercio". Cubre pruebas
  negativas y edge cases por cada campo: campos requeridos, nombre/razón social
  que no pueden ser solo números o símbolos, correos malformados (punto final
  sobrante, caracteres no permitidos, sin dominio/TLD), teléfono de 10 dígitos,
  RNC/Cédula solo numérico de 9 u 11 dígitos, y contraseña mínima. Cada caso
  debe mostrar un mensaje de error claro en español, sin llegar al servidor.

  Background:
    Given el usuario está en el registro de comercio del portal

  @Regresion
  Scenario Outline: Registro con dato inválido muestra un mensaje claro por campo
    When el usuario intenta registrar el comercio con "<dataId>"
    Then se muestra el error de registro esperado para "<dataId>"

    Examples: Nombre comercial
      | dataId            |
      | name-empty        |
      | name-only-numbers |
      | name-symbols-only |
      | name-too-short    |
      | name-only-spaces  |

    Examples: Razón social
      | dataId             |
      | legal-empty        |
      | legal-only-numbers |
      | legal-too-short    |

    Examples: Correo electrónico
      | dataId               |
      | email-empty          |
      | email-no-at          |
      | email-trailing-dot   |
      | email-hash-local     |
      | email-internal-space |
      | email-double-at      |
      | email-no-tld         |
      | email-no-domain      |

    Examples: Teléfono
      | dataId          |
      | phone-empty     |
      | phone-too-short |
      | phone-letters   |
      | phone-too-long  |

    Examples: RNC o Cédula
      | dataId           |
      | tax-empty        |
      | tax-letters      |
      | tax-with-dashes  |
      | tax-wrong-length |

    Examples: Dirección
      | dataId            |
      | address-empty     |
      | address-too-short |

    Examples: Contraseña
      | dataId            |
      | password-empty    |
      | password-too-short |
