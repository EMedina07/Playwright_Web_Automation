@backoffice @promociones @api
Feature: Promociones patrocinadas — publicación, cobro, moderación y carrusel

  Verificación a nivel de API del módulo de promociones (B-02): la pauta se
  paga ANTES de publicarse (sin tarjeta no hay campaña), la ventana de fechas
  manda sobre lo que ve el consumidor, la desactivación distingue QUIÉN la
  hizo (el comercio deshace su clic; la moderación solo la deshace el admin) y
  la configuración global del carrusel respeta sus rangos.

  # ── Configuración del carrusel y precio de la pauta ───────────────────────

  @Regresion @exclusivo
  Scenario: La configuración dentro de rango se guarda y la ve la app pública
    Given la configuración de promociones está anotada
    When el admin fija el intervalo en 60 segundos y el precio por día en RD$100
    Then la configuración pública refleja intervalo 60 y precio 10000 centavos
    And se restaura la configuración original

  @Regresion
  Scenario Outline: La configuración fuera de rango se rechaza (<caso>)
    When el admin intenta fijar intervalo <intervalo> y precio <precio> centavos
    Then la configuración se rechaza

    Examples:
      | caso               | intervalo | precio  |
      | intervalo muy bajo | 29        | 50000   |
      | intervalo muy alto | 1801      | 50000   |
      | precio negativo    | 180       | -1      |
      | precio absurdo     | 180       | 5000001 |

  # ── Cotización y cobro ────────────────────────────────────────────────────

  @Regresion @exclusivo
  Scenario: La cotización es días de la ventana por el precio del día
    Given un comercio QA de promociones con tarjeta
    Then la cotización de hoy a hoy es de 1 día
    And la cotización de hoy a dentro de 4 días es de 5 días y cuadra con el precio configurado

  @Regresion
  Scenario: Con tarjeta en archivo la campaña pagada se publica
    Given un comercio QA de promociones con tarjeta
    When publica una promoción de 2 días con texto "Campaña pagada"
    Then la promoción queda publicada y activa en su lista

  @Regresion @exclusivo
  Scenario: Sin tarjeta no hay campaña pagada
    Given la configuración de promociones está anotada
    And la pauta tiene un precio por día mayor que cero
    And un comercio QA de promociones sin tarjeta
    When intenta publicar una promoción de 1 día
    Then la publicación se rechaza mencionando "tarjeta"
    And no le queda ninguna promoción publicada
    And se restaura la configuración original

  @Regresion @exclusivo
  Scenario: Con la pauta gratis (precio 0) se publica sin tarjeta
    Given la configuración de promociones está anotada
    And el admin fija el precio por día en 0
    And un comercio QA de promociones sin tarjeta
    When intenta publicar una promoción de 1 día
    Then la promoción queda publicada y activa en su lista
    And se restaura la configuración original

  # ── Validaciones de publicación ───────────────────────────────────────────

  @Regresion
  Scenario Outline: Fechas inválidas se rechazan (<caso>)
    Given un comercio QA de promociones con tarjeta
    When intenta publicar con inicio <inicio> y fin <fin>
    Then la publicación se rechaza

    Examples:
      | caso                | inicio | fin  |
      | empieza en pasado   | -1     | 1    |
      | fin antes de inicio | 1      | 0    |
      | ventana de 366 días | 0      | 365  |

  @Regresion
  Scenario: Un texto vacío se rechaza
    Given un comercio QA de promociones con tarjeta
    When intenta publicar con texto vacío
    Then la publicación se rechaza

  @Regresion
  Scenario: Un texto de 281 caracteres se rechaza
    Given un comercio QA de promociones con tarjeta
    When intenta publicar con un texto de 281 caracteres
    Then la publicación se rechaza

  @Regresion
  Scenario: Una sucursal ajena se rechaza
    Given un comercio QA de promociones con tarjeta
    When intenta publicar para la sucursal 999999999
    Then la publicación se rechaza

  @Regresion
  Scenario: Publicar sin imagen se rechaza
    Given un comercio QA de promociones con tarjeta
    When intenta publicar sin imagen
    Then la publicación se rechaza

  @Regresion
  Scenario: Un archivo que no es imagen se rechaza
    Given un comercio QA de promociones con tarjeta
    When intenta publicar con un archivo de texto como imagen
    Then la publicación se rechaza

  @Regresion
  Scenario: Una imagen de más de 3 MB se rechaza
    Given un comercio QA de promociones con tarjeta
    When intenta publicar con una imagen de 4 MB
    Then la publicación se rechaza

  @Regresion
  Scenario: Un comercio suspendido no puede publicar promociones
    Given un comercio QA suspendido por el admin
    When intenta publicar una promoción de 1 día
    Then la publicación se rechaza mencionando "activo"

  # ── Lo que ve el consumidor (nearby) ──────────────────────────────────────

  @Regresion
  Scenario: La ventana de campaña manda sobre el carrusel del consumidor
    Given un comercio QA de promociones con tarjeta
    When publica una promoción vigente con texto "Visible hoy"
    And publica una promoción que empieza en 10 días con texto "Aún no visible"
    Then el carrusel cercano muestra "Visible hoy" y no muestra "Aún no visible"
    When el comercio desactiva la promoción "Visible hoy"
    Then el carrusel cercano tampoco muestra "Visible hoy"

  # ── Desactivar / Reactivar (quién apagó decide quién enciende) ────────────

  @Regresion
  Scenario: El comercio deshace su propia desactivación
    Given un comercio QA de promociones con tarjeta
    And una promoción vigente publicada
    When el comercio la desactiva
    Then su lista la muestra desactivada por "Vendor"
    When el comercio la reactiva
    Then su lista la muestra activa

  @Regresion
  Scenario: Lo que apagó la moderación solo lo enciende el admin
    Given un comercio QA de promociones con tarjeta
    And una promoción vigente publicada
    When el admin la desactiva con motivo "QA: imagen engañosa"
    Then su lista la muestra desactivada por "Admin"
    And el comercio no puede reactivarla y el error menciona "moderación"
    When el admin la reactiva
    Then su lista la muestra activa

  @Regresion
  Scenario: El admin no puede desactivar sin motivo
    Given un comercio QA de promociones con tarjeta
    And una promoción vigente publicada
    When el admin intenta desactivarla sin motivo
    Then la moderación de la promoción se rechaza

  @Regresion
  Scenario: Reactivar una promoción activa se rechaza
    Given un comercio QA de promociones con tarjeta
    And una promoción vigente publicada
    When el comercio intenta reactivarla estando activa
    Then la reactivación se rechaza
