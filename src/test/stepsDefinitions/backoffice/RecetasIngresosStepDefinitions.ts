import { Given, When, Then, After } from '@cucumber/cucumber';
import assert from 'node:assert';
import { CustomWorld } from '../../../support/world';
import { getAdminToken } from '../../../../core/framework_actions/AdminSession';
import { type QaVendor } from '../../../../core/framework_actions/TrustActions';
import { vendorConTarjeta } from '../../../../core/framework_actions/PromotionActions';
import { borrarSuscripcionesDeVendor, refreshRevenue } from '../../../../core/framework_actions/BillingActions';
import { IngresosPage } from '../../../pages/IngresosPage';
import { PlanesPage } from '../../../pages/PlanesPage';
import { PortalPlanPage } from '../../../pages/PortalPlanPage';

const MRR = 'Ingreso mensual proyectado (MRR)';
// Solo las tarjetas del dashboard: los montos del mes viven ahora en la fila
// "(en curso)" de la tabla de 12 meses (el dueño quitó las tarjetas
// redundantes de ingresos cobrados).
const TARJETAS = [MRR, 'Vigentes', 'Bajas del mes'];

interface RState {
  vendor?: QaVendor;
  fotoUi?: Record<string, number>;
}

// Higiene: el comercio de la receta borra sus suscripciones CON su rastro en
// el ledger (la promo la limpia el After de PautaPrecio, que ya comparte
// world) y la vista queda refrescada para la foto del siguiente escenario.
After({ timeout: 90_000 }, async function (this: CustomWorld & RState) {
  if (this.vendor) {
    try { borrarSuscripcionesDeVendor(this.vendor.vendorId); } catch { /* best-effort */ }
    await refreshRevenue().catch(() => undefined);
  }
});

Given('un comercio QA con tarjeta para la receta', { timeout: 120_000 }, async function (this: CustomWorld & RState) {
  this.vendor = await vendorConTarjeta(await getAdminToken());
});

Given('las tarjetas de Ingresos están anotadas desde la pantalla', { timeout: 90_000 }, async function (this: CustomWorld & RState) {
  await refreshRevenue(); // la foto arranca de una vista al día
  const page = this.getPage(IngresosPage);
  await page.openAsAdmin(await getAdminToken());
  this.fotoUi = await page.leerTarjetas(TARJETAS);
  const mes = await page.mesEnCurso();
  this.fotoUi['Suscripciones este mes'] = mes.subscriptions;
  this.fotoUi['Publicidad este mes'] = mes.advertising;
  this.fotoUi['Total del mes'] = mes.total;
});

When('el comercio activa Pro desde su portal con la tarjeta en archivo', { timeout: 120_000 }, async function (this: CustomWorld & RState) {
  const portal = this.getPage(PortalPlanPage);
  await portal.entrar(this.vendor!.email, this.vendor!.password, this.vendor!.totpSecret);
  await portal.abrirPlan();
  await portal.activarProConTarjetaEnArchivo();
});

Then('en Ingresos, en segundos: el MRR sube {int}, Vigentes {int} y las suscripciones del mes {int}', { timeout: 90_000 }, async function (this: CustomWorld & RState, mrr: number, vigentes: number, subsMes: number) {
  const page = this.getPage(IngresosPage);
  await page.openAsAdmin(await getAdminToken());
  await page.esperarTarjeta(MRR, this.fotoUi![MRR] + mrr);
  assert.strictEqual(await page.tarjeta('Vigentes'), this.fotoUi!['Vigentes'] + vigentes,
    'Vigentes no refleja la suscripción asignada.');
  await page.esperarMesEnCurso('subscriptions', this.fotoUi!['Suscripciones este mes'] + subsMes);
});

Then('en la auditoría el primer pago de suscripción es {string} {string} del comercio', { timeout: 90_000 }, async function (this: CustomWorld & RState, monto: string, estado: string) {
  const planes = this.getPage(PlanesPage);
  await planes.openAsAdmin(await getAdminToken());
  // Se busca LA FILA DEL COMERCIO (no la primera global): bajo ejecución en
  // paralelo la fila más reciente puede ser de otro escenario.
  const pago = await planes.pagoDelComercio(this.vendor!.vendorId, 'Subscription');
  assert.strictEqual(pago.monto, monto, `Monto del pago: esperado ${monto}, visible ${pago.monto}.`);
  assert.strictEqual(pago.estado, estado);
});

Then('en la auditoría la primera factura de suscripción del comercio está {string}', { timeout: 90_000 }, async function (this: CustomWorld & RState, estado: string) {
  const factura = await this.getPage(PlanesPage).facturaDelComercio(this.vendor!.vendorId, 'Subscription');
  assert.strictEqual(factura.estado, estado);
});

When('el comercio vuelve al plan Gratis desde su portal', { timeout: 120_000 }, async function (this: CustomWorld & RState) {
  const portal = this.getPage(PortalPlanPage);
  // Los pasos de Ingresos/auditoría dejaron la pestaña en el back-office.
  await portal.volverAlPortal();
  await portal.abrirPlan();
  await portal.volverAGratis();
});

Then('su suscripción queda listada como {string} en la tabla de Planes', { timeout: 90_000 }, async function (this: CustomWorld & RState, estado: string) {
  const planes = this.getPage(PlanesPage);
  await planes.openAsAdmin(await getAdminToken());
  const visible = await planes.estadoSuscripcion(this.vendor!.name);
  assert.strictEqual(visible, estado,
    `La baja del comercio debía quedar como "${estado}" en el panel y se ve "${visible}".`);
});

Then('en Ingresos, en segundos: Bajas del mes sube {int} y el MRR y Vigentes vuelven a lo anotado', { timeout: 90_000 }, async function (this: CustomWorld & RState, bajas: number) {
  const page = this.getPage(IngresosPage);
  await page.openAsAdmin(await getAdminToken());
  await page.esperarTarjeta('Bajas del mes', this.fotoUi!['Bajas del mes'] + bajas);
  assert.strictEqual(await page.tarjeta(MRR), this.fotoUi![MRR],
    'El MRR no volvió a lo anotado tras cancelar.');
  assert.strictEqual(await page.tarjeta('Vigentes'), this.fotoUi!['Vigentes'],
    'Vigentes no volvió a lo anotado tras cancelar.');
});

Then('el pago sigue en la auditoría aunque la suscripción se canceló', { timeout: 90_000 }, async function (this: CustomWorld & RState) {
  const planes = this.getPage(PlanesPage);
  await planes.openAsAdmin(await getAdminToken());
  const pago = await planes.pagoDelComercio(this.vendor!.vendorId, 'Subscription');
  assert.strictEqual(pago.estado, 'Succeeded',
    'Cancelar borró o alteró el cobro del ledger: la plata SÍ entró y el rastro es inmutable.');
});

Then('en Ingresos, en segundos: la publicidad del mes sube {int}', { timeout: 90_000 }, async function (this: CustomWorld & RState, pesos: number) {
  const page = this.getPage(IngresosPage);
  await page.openAsAdmin(await getAdminToken());
  await page.esperarMesEnCurso('advertising', this.fotoUi!['Publicidad este mes'] + pesos);
});

Then('en la auditoría el primer pago de publicidad es {string} {string} del comercio', { timeout: 90_000 }, async function (this: CustomWorld & RState, monto: string, estado: string) {
  const planes = this.getPage(PlanesPage);
  await planes.openAsAdmin(await getAdminToken());
  const pago = await planes.primerPago('Advertising');
  assert.strictEqual(pago.monto, monto);
  assert.strictEqual(pago.estado, estado);
  assert.strictEqual(pago.comercio, String(this.vendor!.vendorId));
});

Then('el Total del mes de la pantalla es exactamente Suscripciones más Publicidad', function (this: CustomWorld & RState) {
  const foto = this.fotoUi!;
  assert.strictEqual(foto['Total del mes'], foto['Suscripciones este mes'] + foto['Publicidad este mes'],
    `El total (${foto['Total del mes']}) no cuadra con ${foto['Suscripciones este mes']} + ${foto['Publicidad este mes']}.`);
});
