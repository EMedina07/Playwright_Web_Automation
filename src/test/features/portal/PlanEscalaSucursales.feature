@portal @plan @escala
Feature: Escala de precios por sucursales — Pro cobra exactamente lo publicado

  El precio publicado es uniforme (EP-16): sin sucursales o con una se cobra el
  monto fijo del primer tramo; de ahí en adelante, el monto del tramo POR
  sucursal. El comercio se aprovisiona por API (registro real, correo
  verificado, aprobación y MFA), pero el cambio a Pro se hace DESDE EL PORTAL
  con la tarjeta en archivo — y el mismo monto tiene que aparecer en la
  cotización del portal, en su Facturación, y en las tres vistas de la
  Auditoría del back-office: factura, pago y journal.

  @Regresion
  Scenario Outline: con <sucursales> sucursal(es) se cobra <monto> y cuadra en portal y auditoría
    Given un comercio QA por API con <sucursales> sucursales y tarjeta en archivo
    When el comercio entra al portal y abre su pestaña Plan
    Then el portal le cotiza Pro en <monto> pesos mensuales
    When activa Pro con la tarjeta en archivo desde el portal
    Then el plan Pro queda activo en el portal
    And en la Facturación del portal su último pago es de <monto> pesos "Aprobado"
    And en la auditoría del back-office su factura de suscripción es de <monto> pesos y está "Paid"
    And en la auditoría del back-office su pago de suscripción es de <monto> pesos y está "Succeeded"
    And en el journal del back-office su cobro aprobado es de <monto> pesos y el detalle lo confirma

    Examples:
      | sucursales | monto |
      | 0          | 2000  |
      | 1          | 2000  |
      | 2          | 3600  |
      | 3          | 5400  |
      | 4          | 6400  |
      | 6          | 9600  |
      | 7          | 9800  |
      | 20         | 28000 |
      | 21         | 25200 |
      | 25         | 30000 |
