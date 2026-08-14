import { Given, When, Then, After } from '@cucumber/cucumber';
import assert from 'node:assert';
import { CustomWorld } from '../../../support/world';
import { getAdminToken } from '../../../../core/framework_actions/AdminSession';
import { provisionVendorConSucursales, type QaVendor } from '../../../../core/framework_actions/TrustActions';
import { addCard } from '../../../../core/framework_actions/PromotionActions';
import {
  activarProPorApi, borrarSuscripcionesDeVendor, inflarMontoSuscripcion,
  refreshRevenue, suscripcionAbiertaDeVendor,
} from '../../../../core/framework_actions/BillingActions';
import { IngresosPage } from '../../../pages/IngresosPage';

interface TState {
  vendor?: QaVendor;
}

After({ timeout: 90_000 }, async function (this: CustomWorld & TState) {
  if (this.vendor) {
    try { borrarSuscripcionesDeVendor(this.vendor.vendorId); } catch { /* best-effort */ }
    await refreshRevenue().catch(() => undefined);
  }
});

Given('un comercio QA con una suscripción de monto gigante de {int} pesos al mes', { timeout: 240_000 }, async function (this: CustomWorld & TState, pesos: number) {
  this.vendor = await provisionVendorConSucursales(await getAdminToken(), 1);
  await addCard(this.vendor);
  await activarProPorApi(this.vendor);
  inflarMontoSuscripcion(suscripcionAbiertaDeVendor(this.vendor.vendorId), pesos * 100);
  await refreshRevenue(); // la vista del MRR se refresca bajo demanda
});

When('el admin abre la pantalla de Ingresos', { timeout: 90_000 }, async function (this: CustomWorld & TState) {
  await this.getPage(IngresosPage).openAsAdmin(await getAdminToken());
});

When('la pantalla se angosta a {int} píxeles', { timeout: 60_000 }, async function (this: CustomWorld & TState, ancho: number) {
  await this.getPage(IngresosPage).angostarPantalla(ancho);
});

Then('la tarjeta del MRR muestra al menos {int} pesos', { timeout: 60_000 }, async function (this: CustomWorld & TState, pesos: number) {
  const mrr = await this.getPage(IngresosPage).tarjeta('Ingreso mensual proyectado (MRR)');
  assert.ok(mrr >= pesos,
    `El MRR debía incluir el monto gigante (>= RD$${pesos}) y la tarjeta dice RD$${mrr} — el monto no está completo.`);
});

Then('ninguna tarjeta del dashboard tiene el monto desbordado', { timeout: 60_000 }, async function (this: CustomWorld & TState) {
  const desbordadas = await this.getPage(IngresosPage).tarjetasConMontoDesbordado();
  assert.deepStrictEqual(desbordadas, [],
    `El monto se sale de su tarjeta en: ${desbordadas.join(', ')}.`);
});
