import path from 'node:path';
import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert';
import { CustomWorld } from '../../../support/world';
import { type QaVendor } from '../../../../core/framework_actions/TrustActions';
import { PortalPlanPage } from '../../../pages/PortalPlanPage';
import { PortalSubidaPage } from '../../../pages/PortalSubidaPage';

interface SubidaState {
  vendor?: QaVendor;
}

const FIXTURES = path.resolve('src/test/fixtures/excel');

// El Given ("un comercio QA por API con {int} sucursales y sin tarjeta") y la
// higiene del After viven en PlanCicloVidaStepDefinitions — mismo world.

When('el comercio entra al portal y abre Subir Excel', { timeout: 120_000 }, async function (this: CustomWorld & SubidaState) {
  const portal = this.getPage(PortalPlanPage);
  await portal.entrar(this.vendor!.email, this.vendor!.password, this.vendor!.totpSecret);
  await this.getPage(PortalSubidaPage).abrirSubirExcel();
});

When('guarda el mapeo de columnas sku {string} y precio {string}', { timeout: 60_000 }, async function (this: CustomWorld & SubidaState, sku: string, precio: string) {
  await this.getPage(PortalSubidaPage).guardarMapeo({ sku, precio });
});

When('sube el archivo de precios {string}', { timeout: 60_000 }, async function (this: CustomWorld & SubidaState, nombre: string) {
  await this.getPage(PortalSubidaPage).subirArchivo(path.join(FIXTURES, nombre));
});

Then('la carga publica {int} precios y deja {int} en revisión', { timeout: 60_000 }, async function (this: CustomWorld & SubidaState, publicados: number, enRevision: number) {
  const resultado = await this.getPage(PortalSubidaPage).resultadoDeCarga();
  assert.strictEqual(resultado.publicados, publicados,
    `Publicados: esperados ${publicados}, el lote dice ${resultado.publicados}.`);
  assert.strictEqual(resultado.enRevision, enRevision,
    `En revisión: esperados ${enRevision}, el lote dice ${resultado.enRevision}.`);
});

When('abre la pestaña Por revisar', { timeout: 60_000 }, async function (this: CustomWorld & SubidaState) {
  await this.getPage(PortalSubidaPage).abrirPorRevisar();
});

Then('el producto {string} aparece listado como {string}', { timeout: 60_000 }, async function (this: CustomWorld & SubidaState, sku: string, motivo: string) {
  assert.ok(await this.getPage(PortalSubidaPage).itemListadoConMotivo(sku, motivo),
    `"${sku}" está en la cola pero sin el motivo "${motivo}" visible.`);
});

When('descarta el producto {string}', { timeout: 60_000 }, async function (this: CustomWorld & SubidaState, sku: string) {
  await this.getPage(PortalSubidaPage).descartarItem(sku);
});

Then('no queda nada por revisar', { timeout: 60_000 }, async function (this: CustomWorld & SubidaState) {
  await this.getPage(PortalSubidaPage).nadaPendiente();
});
