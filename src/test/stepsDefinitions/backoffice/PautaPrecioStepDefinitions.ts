import { Given, When, Then, After } from '@cucumber/cucumber';
import assert from 'node:assert';
import { CustomWorld } from '../../../support/world';
import { getAdminToken } from '../../../../core/framework_actions/AdminSession';
import { type QaVendor } from '../../../../core/framework_actions/TrustActions';
import {
  vendorConTarjeta, vendorJwt, getSettings, putSettings, myPromotions,
  cobroDePromocion, borrarPromo, isoInDays, nuevoCaption, PNG_1X1,
  type PromoSettings,
} from '../../../../core/framework_actions/PromotionActions';
import { PromocionesModeracionPage } from '../../../pages/PromocionesModeracionPage';
import { PortalPromocionesPage } from '../../../pages/PortalPromocionesPage';

interface QState {
  vendor?: QaVendor;
  pautaBase?: PromoSettings;
  caption?: string;
  promoPublicadaId?: number;
}

// Higiene: la pauta es configuración GLOBAL — se restaura aunque el escenario
// falle; la promo publicada de verdad (con su cobro) se borra del registro.
After({ timeout: 90_000 }, async function (this: CustomWorld & QState) {
  if (this.pautaBase) {
    try {
      await putSettings(await getAdminToken(), this.pautaBase.intervalSeconds, this.pautaBase.advertisingPricePerDayCents);
    } catch { /* best-effort */ }
  }
  if (this.promoPublicadaId !== undefined) {
    try { borrarPromo(this.promoPublicadaId); } catch { /* best-effort */ }
  }
});

Given('la configuración de la pauta está anotada para restaurarla', async function (this: CustomWorld & QState) {
  this.pautaBase = await getSettings(await getAdminToken());
});

When('el admin fija en el back-office el precio de la publicidad en RD${int}', { timeout: 60_000 }, async function (this: CustomWorld & QState, pesos: number) {
  const page = this.getPage(PromocionesModeracionPage);
  await page.openAsAdmin(await getAdminToken());
  await page.setAdvertisingPrice(pesos);
});

Then('el aviso {string} aparece y se retira solo', { timeout: 30_000 }, async function (this: CustomWorld & QState, _aviso: string) {
  await this.getPage(PromocionesModeracionPage).waitGuardadoApareceYDesaparece();
});

Given('el precio de la pauta quedó en {int} pesos por día', async function (this: CustomWorld & QState, pesos: number) {
  const r = await putSettings(await getAdminToken(), this.pautaBase!.intervalSeconds, pesos * 100);
  assert.ok(r.ok, `No se pudo fijar la pauta: ${r.status}`);
});

Given('el comercio QA abre Promociones patrocinadas en el portal', { timeout: 120_000 }, async function (this: CustomWorld & QState) {
  this.vendor = await vendorConTarjeta(await getAdminToken());
  await this.getPage(PortalPromocionesPage).openAsVendor(await vendorJwt(this.vendor));
});

Then('la cotización para hoy dice {string}', { timeout: 30_000 }, async function (this: CustomWorld & QState, esperado: string) {
  // El formulario abre con Inicio=Fin=hoy: la cotización de 1 día ya está en
  // pantalla con el precio que acaba de definir el admin.
  assert.strictEqual(await this.getPage(PortalPromocionesPage).quoteLine(), esperado);
});

When('elige una campaña de hoy a dentro de {int} días', async function (this: CustomWorld & QState, dias: number) {
  await this.getPage(PortalPromocionesPage).setCampaignDates(isoInDays(0), isoInDays(dias));
});

When('elige una campaña de hoy a dentro de {int} día', async function (this: CustomWorld & QState, dias: number) {
  await this.getPage(PortalPromocionesPage).setCampaignDates(isoInDays(0), isoInDays(dias));
});

Then('la cotización dice {string}', { timeout: 30_000 }, async function (this: CustomWorld & QState, esperado: string) {
  assert.strictEqual(await this.getPage(PortalPromocionesPage).quoteLine(), esperado);
});

Then('el botón de publicar dice {string}', async function (this: CustomWorld & QState, esperado: string) {
  assert.strictEqual(await this.getPage(PortalPromocionesPage).publishButtonLabel(), esperado);
});

When('publica la promoción desde el portal', { timeout: 60_000 }, async function (this: CustomWorld & QState) {
  this.caption = nuevoCaption('Cobro pauta');
  await this.getPage(PortalPromocionesPage).publicar(this.caption, PNG_1X1);
  const row = (await myPromotions(this.vendor!)).find((p) => p.caption === this.caption);
  assert.ok(row, 'La promoción publicada no aparece en la lista del comercio.');
  this.promoPublicadaId = row.id;
});

Then('el cobro registrado en el ledger es de {int} centavos, acreditado y facturado', function (this: CustomWorld & QState, centavos: number) {
  const cobro = cobroDePromocion(this.promoPublicadaId!);
  assert.strictEqual(cobro.amountCents, centavos,
    `El cobro fue de ${cobro.amountCents} centavos; el admin definió un total de ${centavos}.`);
  assert.strictEqual(cobro.status, 'Succeeded', `El pago no se acreditó: ${cobro.status}`);
  assert.strictEqual(cobro.invoiceStatus, 'Paid', `La factura no quedó pagada: ${cobro.invoiceStatus}`);
});
