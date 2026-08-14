import { Given, When, Then, After } from '@cucumber/cucumber';
import assert from 'node:assert';
import { ConfianzaPage } from '../../../pages/ConfianzaPage';
import { CustomWorld } from '../../../support/world';
import { getAdminToken } from '../../../../core/framework_actions/AdminSession';
import {
  borrarReportesDeVendor, provisionActiveVendor, reportFromDistinctConsumers, registerConsumer,
  report, tryVendorLogin, appCanShowVendor, vendorStatus, type QaVendor,
} from '../../../../core/framework_actions/TrustActions';

interface TrustState { vendor?: QaVendor }

// Higiene: los reportes del comercio QA se borran al salir — acumulados,
// empujan a los comercios de corridas futuras fuera de la primera página del
// panel (ordena por cantidad de reportes) y producen falsos rojos.
After({ timeout: 30_000 }, function (this: CustomWorld & TrustState) {
  if (this.vendor) {
    try { borrarReportesDeVendor(this.vendor.vendorId); } catch { /* best-effort */ }
  }
});

Given('un comercio de prueba activo y publicado', { timeout: 60_000 }, async function (this: CustomWorld) {
  const token = await getAdminToken();
  (this as CustomWorld & TrustState).vendor = await provisionActiveVendor(token);
});

Given('el comercio recibe 2 reportes de caja de 2 consumidores', { timeout: 30_000 }, async function (this: CustomWorld) {
  const s = this as CustomWorld & TrustState;
  await reportFromDistinctConsumers(s.vendor!, 2);
});

Given('el comercio se auto-suspende por 5 reportes de 3 consumidores distintos', { timeout: 40_000 }, async function (this: CustomWorld) {
  const s = this as CustomWorld & TrustState;
  const v = s.vendor!;
  // 5 reportes de 5 consumidores distintos (≥3) → cruza el umbral.
  const suspended = await reportFromDistinctConsumers(v, 5);
  const token = await getAdminToken();
  assert.strictEqual(await vendorStatus(token, v.vendorId), 'Suspended',
    `Precondición: el comercio debía quedar suspendido (vendorSuspended=${suspended}).`);
});

When('el admin abre la pantalla de Confianza', { timeout: 40_000 }, async function (this: CustomWorld) {
  const token = await getAdminToken();
  await this.getPage(ConfianzaPage).openAsAdmin(token);
});

When('el admin abre el detalle del comercio', async function (this: CustomWorld) {
  const s = this as CustomWorld & TrustState;
  await this.getPage(ConfianzaPage).openDetail(s.vendor!.name);
});

When('el admin suspende al comercio con motivo {string}', async function (this: CustomWorld, reason: string) {
  await this.getPage(ConfianzaPage).suspendFromDetail(reason);
});

When('el admin reactiva al comercio desde el detalle', async function (this: CustomWorld) {
  const s = this as CustomWorld & TrustState;
  await this.getPage(ConfianzaPage).openDetail(s.vendor!.name);
  await this.getPage(ConfianzaPage).reactivateFromDetail();
});

Then('el panel muestra al comercio como {string}', { timeout: 25_000 }, async function (this: CustomWorld, status: string) {
  const s = this as CustomWorld & TrustState;
  await this.getPage(ConfianzaPage).waitForStatus(s.vendor!.name, status as 'Active' | 'Suspended');
});

Then('el comercio desaparece de la lista de confianza', { timeout: 25_000 }, async function (this: CustomWorld) {
  const s = this as CustomWorld & TrustState;
  await this.getPage(ConfianzaPage).waitForAbsent(s.vendor!.name);
});

Then('el comercio suspendido no puede entrar al portal de comercios', async function (this: CustomWorld) {
  const s = this as CustomWorld & TrustState;
  const login = await tryVendorLogin(s.vendor!);
  assert.ok(login.status === 422 && !login.hasToken,
    `Debía bloquearse el login del comercio suspendido; recibí HTTP ${login.status}, token=${login.hasToken}, msg="${login.title ?? ''}"`);
});

Then('el comercio reactivado sí puede entrar al portal de comercios', async function (this: CustomWorld) {
  const s = this as CustomWorld & TrustState;
  const login = await tryVendorLogin(s.vendor!);
  assert.ok(login.ok && login.hasToken,
    `El comercio reactivado debía poder entrar; recibí HTTP ${login.status}, token=${login.hasToken}`);
});

Then('la app ya no puede mostrar al comercio', async function (this: CustomWorld) {
  const s = this as CustomWorld & TrustState;
  assert.strictEqual(await appCanShowVendor(s.vendor!.vendorId, s.vendor!.productId), false,
    'La app no debería poder mostrar/recomendar un comercio suspendido.');
});

Then('la app vuelve a poder mostrar al comercio', async function (this: CustomWorld) {
  const s = this as CustomWorld & TrustState;
  assert.strictEqual(await appCanShowVendor(s.vendor!.vendorId, s.vendor!.productId), true,
    'La app debería volver a mostrar/recomendar al comercio reactivado.');
});
