import { Given, When, Then, After } from '@cucumber/cucumber';
import assert from 'node:assert';
import { CustomWorld } from '../../../support/world';
import { getAdminToken } from '../../../../core/framework_actions/AdminSession';
import { provisionVendorConSucursales, type QaVendor } from '../../../../core/framework_actions/TrustActions';
import { addCard } from '../../../../core/framework_actions/PromotionActions';
import { borrarSuscripcionesDeVendor, refreshRevenue } from '../../../../core/framework_actions/BillingActions';
import { PortalPlanPage } from '../../../pages/PortalPlanPage';
import { PlanesPage } from '../../../pages/PlanesPage';

interface EscalaState {
  vendor?: QaVendor;
}

/// "RD$3,600.00" | "RD$3,600" → 3600 (los formatos difieren entre pantallas).
const pesos = (texto: string): number => Number((/([\d.,]+)/.exec(texto)?.[1] ?? '').replace(/,/g, ''));

// Higiene: la suscripción QA se borra CON su rastro del ledger (los cobros QA
// no son ingresos) y la vista de totales queda refrescada.
After({ timeout: 90_000 }, async function (this: CustomWorld & EscalaState) {
  if (this.vendor) {
    try { borrarSuscripcionesDeVendor(this.vendor.vendorId); } catch { /* best-effort */ }
    await refreshRevenue().catch(() => undefined);
  }
});

Given('un comercio QA por API con {int} sucursales y tarjeta en archivo', { timeout: 240_000 }, async function (this: CustomWorld & EscalaState, sucursales: number) {
  this.vendor = await provisionVendorConSucursales(await getAdminToken(), sucursales);
  await addCard(this.vendor);
});

When('el comercio entra al portal y abre su pestaña Plan', { timeout: 90_000 }, async function (this: CustomWorld & EscalaState) {
  const portal = this.getPage(PortalPlanPage);
  await portal.entrar(this.vendor!.email, this.vendor!.password, this.vendor!.totpSecret);
  await portal.abrirPlan();
});

Then('el portal le cotiza Pro en {int} pesos mensuales', { timeout: 90_000 }, async function (this: CustomWorld & EscalaState, monto: number) {
  const cotizado = await this.getPage(PortalPlanPage).precioMensualCotizado();
  assert.strictEqual(cotizado, monto,
    `La cotización del portal no respeta la escala: esperado RD$${monto}, cotizó RD$${cotizado}.`);
});

When('activa Pro con la tarjeta en archivo desde el portal', { timeout: 90_000 }, async function (this: CustomWorld & EscalaState) {
  await this.getPage(PortalPlanPage).activarProConTarjetaEnArchivo();
});

Then('el plan Pro queda activo en el portal', { timeout: 90_000 }, async function (this: CustomWorld & EscalaState) {
  assert.ok(await this.getPage(PortalPlanPage).proEstaActivo(), 'El plan Pro no figura Activo en el portal.');
});

Then('en la Facturación del portal su último pago es de {int} pesos {string}', { timeout: 90_000 }, async function (this: CustomWorld & EscalaState, monto: number, estado: string) {
  const pago = await this.getPage(PortalPlanPage).ultimoPago();
  assert.strictEqual(pago.monto, monto,
    `El pago que ve el comercio no es lo cotizado: esperado RD$${monto}, cobrado RD$${pago.monto}.`);
  assert.strictEqual(pago.estado, estado);
});

Then('en la auditoría del back-office su factura de suscripción es de {int} pesos y está {string}', { timeout: 90_000 }, async function (this: CustomWorld & EscalaState, monto: number, estado: string) {
  const planes = this.getPage(PlanesPage);
  await planes.asegurarAbiertoComoAdmin(await getAdminToken());
  const factura = await planes.facturaDelComercio(this.vendor!.vendorId, 'Subscription');
  assert.strictEqual(pesos(factura.monto), monto,
    `Lo facturado no cuadra con el cobro: esperado RD$${monto}, facturado ${factura.monto}.`);
  assert.strictEqual(factura.estado, estado);
});

Then('en la auditoría del back-office su pago de suscripción es de {int} pesos y está {string}', { timeout: 90_000 }, async function (this: CustomWorld & EscalaState, monto: number, estado: string) {
  const planes = this.getPage(PlanesPage);
  await planes.asegurarAbiertoComoAdmin(await getAdminToken());
  const pago = await planes.pagoDelComercio(this.vendor!.vendorId, 'Subscription');
  assert.strictEqual(pesos(pago.monto), monto,
    `El pago del ledger no cuadra: esperado RD$${monto}, registrado ${pago.monto}.`);
  assert.strictEqual(pago.estado, estado);
});

Then('en el journal del back-office su cobro aprobado es de {int} pesos y el detalle lo confirma', { timeout: 90_000 }, async function (this: CustomWorld & EscalaState, monto: number) {
  const planes = this.getPage(PlanesPage);
  await planes.asegurarAbiertoComoAdmin(await getAdminToken());
  const journal = await planes.journalDelComercio(this.vendor!.vendorId, 'SUBSCRIPTION_PAYMENT_SUCCEEDED');
  assert.strictEqual(pesos(journal.monto), monto,
    `El journal no cuadra con el cobro: esperado RD$${monto}, registró ${journal.monto}.`);
  // El snapshot (Ver detalle) es la foto contable del hecho: debe traer el
  // monto en centavos — la evidencia de que el detalle expone el dato real.
  assert.ok(journal.snapshot.includes(String(monto * 100)),
    `El snapshot del journal no contiene el monto en centavos (${monto * 100}).`);
});
