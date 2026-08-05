import { Given, When, Then, After } from '@cucumber/cucumber';
import assert from 'node:assert';
import { CustomWorld } from '../../../support/world';
import { getAdminToken } from '../../../../core/framework_actions/AdminSession';
import { type QaVendor } from '../../../../core/framework_actions/TrustActions';
import {
  vendorConTarjeta, vendorJwt, createPromotion, adminDeactivate, borrarPromo,
  isoInDays, nuevoCaption,
} from '../../../../core/framework_actions/PromotionActions';
import { PromocionesModeracionPage } from '../../../pages/PromocionesModeracionPage';
import { PortalPromocionesPage } from '../../../pages/PortalPromocionesPage';

interface BState {
  vendor?: QaVendor;
  caption?: string;
  promoId?: number;
}

// Higiene: cada escenario crea SU promoción y la borra al salir — el registro
// de moderación del admin no acumula residuos QA (pedido del dueño).
After({ timeout: 90_000 }, function (this: CustomWorld & BState) {
  if (this.promoId !== undefined) {
    try { borrarPromo(this.promoId); } catch { /* best-effort */ }
  }
});

Given('una promoción vigente de un comercio QA', { timeout: 120_000 }, async function (this: CustomWorld & BState) {
  this.vendor = await vendorConTarjeta(await getAdminToken());
  this.caption = nuevoCaption('Botones');
  const r = await createPromotion(this.vendor, {
    caption: this.caption, startsOn: isoInDays(0), endsOn: isoInDays(1),
  });
  assert.ok(r.ok, `No se pudo publicar la promoción base: ${r.status} ${JSON.stringify(r.data)}`);
  this.promoId = (r.data as { promotionId: number }).promotionId;
});

Given('el admin la desactivó por moderación', { timeout: 60_000 }, async function (this: CustomWorld & BState) {
  const r = await adminDeactivate(await getAdminToken(), this.promoId!, 'QA: moderación para la prueba de botones');
  assert.ok(r.ok, `La moderación falló: ${r.status}`);
});

// ── Back-office ──────────────────────────────────────────────────────────────

Given('el admin abre la moderación de promociones', { timeout: 60_000 }, async function (this: CustomWorld & BState) {
  await this.getPage(PromocionesModeracionPage).openAsAdmin(await getAdminToken());
});

When('el admin pulsa Desactivar y confirma con motivo {string}', async function (this: CustomWorld & BState, motivo: string) {
  await this.getPage(PromocionesModeracionPage).deactivate(this.caption!, motivo);
});

When('el admin pulsa Desactivar pero cancela el motivo', async function (this: CustomWorld & BState) {
  await this.getPage(PromocionesModeracionPage).openDeactivateAndCancel(this.caption!);
});

When('el admin pulsa Reactivar', async function (this: CustomWorld & BState) {
  await this.getPage(PromocionesModeracionPage).reactivate(this.caption!);
});

Then('la tarjeta muestra la promoción {string} con el botón Reactivar', async function (this: CustomWorld & BState, estado: string) {
  await this.getPage(PromocionesModeracionPage).waitForState(this.caption!, estado as 'Activa' | 'Desactivada');
});

Then('la tarjeta muestra la promoción {string} con el botón Desactivar', async function (this: CustomWorld & BState, estado: string) {
  await this.getPage(PromocionesModeracionPage).waitForState(this.caption!, estado as 'Activa' | 'Desactivada');
});

// ── Portal ───────────────────────────────────────────────────────────────────

Given('el comercio abre sus promociones en el portal', { timeout: 60_000 }, async function (this: CustomWorld & BState) {
  await this.getPage(PortalPromocionesPage).openAsVendor(await vendorJwt(this.vendor!));
});

When('el comercio pulsa Desactivar y acepta la confirmación', async function (this: CustomWorld & BState) {
  await this.getPage(PortalPromocionesPage).deactivate(this.caption!, true);
});

When('el comercio pulsa Desactivar pero rechaza la confirmación', async function (this: CustomWorld & BState) {
  await this.getPage(PortalPromocionesPage).deactivate(this.caption!, false);
});

When('el comercio pulsa Reactivar', async function (this: CustomWorld & BState) {
  await this.getPage(PortalPromocionesPage).reactivate(this.caption!);
});

Then('el portal muestra la promoción {string} con el botón Reactivar del comercio', async function (this: CustomWorld & BState, estado: string) {
  const page = this.getPage(PortalPromocionesPage);
  await page.waitForState(this.caption!, estado as 'Activa' | 'Desactivada');
  assert.ok(await page.reactivarDisponible(this.caption!),
    'El botón Reactivar no está disponible tras desactivar el propio comercio.');
});

Then('el portal muestra la promoción {string}', async function (this: CustomWorld & BState, estado: string) {
  await this.getPage(PortalPromocionesPage).waitForState(this.caption!, estado as 'Activa' | 'Desactivada');
});

Then('el portal muestra la promoción {string} sin botón Reactivar y con el aviso de moderación', async function (this: CustomWorld & BState, estado: string) {
  const page = this.getPage(PortalPromocionesPage);
  await page.waitForState(this.caption!, estado as 'Activa' | 'Desactivada');
  assert.ok(!(await page.reactivarDisponible(this.caption!)),
    'El comercio ve un botón Reactivar sobre una moderación del admin.');
  assert.ok(await page.avisoModeracionVisible(this.caption!),
    'No se muestra el aviso "Desactivada por PriceList (moderación)".');
});
