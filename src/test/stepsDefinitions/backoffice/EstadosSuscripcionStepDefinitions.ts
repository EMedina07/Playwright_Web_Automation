import { Given, When, Then, After } from '@cucumber/cucumber';
import assert from 'node:assert';
import { CustomWorld } from '../../../support/world';
import { getAdminToken } from '../../../../core/framework_actions/AdminSession';
import { provisionVendorConSucursales, type QaVendor } from '../../../../core/framework_actions/TrustActions';
import { addCard } from '../../../../core/framework_actions/PromotionActions';
import {
  activarProPorApi, borrarSuscripcionesDeVendor, marcarCancelada, marcarPastDue,
  marcarSuspendida, refreshRevenue, suscripcionAbiertaDeVendor,
} from '../../../../core/framework_actions/BillingActions';
import { PlanesPage } from '../../../pages/PlanesPage';

interface EstadosState {
  vendors?: QaVendor[];
}

const ORDINAL: Record<string, number> = { primero: 0, segundo: 1, tercero: 2, cuarto: 3 };

After({ timeout: 90_000 }, async function (this: CustomWorld & EstadosState) {
  for (const v of this.vendors ?? []) {
    try { borrarSuscripcionesDeVendor(v.vendorId); } catch { /* best-effort */ }
  }
  if (this.vendors?.length) await refreshRevenue().catch(() => undefined);
});

Given('cuatro comercios QA con suscripción Pro activada por API', { timeout: 240_000 }, async function (this: CustomWorld & EstadosState) {
  const adminToken = await getAdminToken();
  this.vendors = [];
  for (let i = 0; i < 4; i++) {
    const v = await provisionVendorConSucursales(adminToken, 1);
    await addCard(v);
    await activarProPorApi(v);
    this.vendors.push(v);
  }
});

When('en base de datos al segundo se le vence el período con un cobro fallido', function (this: CustomWorld & EstadosState) {
  marcarPastDue(suscripcionAbiertaDeVendor(this.vendors![1].vendorId));
});

When('en base de datos al tercero se le agotan los tres reintentos', function (this: CustomWorld & EstadosState) {
  marcarSuspendida(suscripcionAbiertaDeVendor(this.vendors![2].vendorId));
});

When('en base de datos al cuarto se le cancela la suscripción', function (this: CustomWorld & EstadosState) {
  marcarCancelada(suscripcionAbiertaDeVendor(this.vendors![3].vendorId));
});

Then('la tabla de Suscripciones muestra al {word} como {string}', { timeout: 90_000 }, async function (this: CustomWorld & EstadosState, ordinal: string, estado: string) {
  const posicion = ORDINAL[ordinal];
  assert.ok(posicion !== undefined, `Ordinal desconocido: "${ordinal}".`);
  const planes = this.getPage(PlanesPage);
  await planes.asegurarAbiertoComoAdmin(await getAdminToken());
  const visible = await planes.estadoSuscripcion(this.vendors![posicion].name);
  assert.strictEqual(visible, estado,
    `El comercio ${ordinal} (${this.vendors![posicion].name}) debía verse "${estado}" y se ve "${visible}".`);
});
