import path from 'node:path';
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert';
import { CustomWorld } from '../../../support/world';
import crypto from 'node:crypto';
import { postSignedBatch, raw, type QaVendor } from '../../../../core/framework_actions/TrustActions';
import { vendorJwt } from '../../../../core/framework_actions/PromotionActions';
import { PortalPlanPage } from '../../../pages/PortalPlanPage';
import { PortalSubidaPage } from '../../../pages/PortalSubidaPage';

interface SubidaState {
  vendor?: QaVendor;
  skuInedito?: string;
}

const FIXTURES = path.resolve('src/test/fixtures/excel');

// El Given ("un comercio QA por API con {int} sucursales y sin tarjeta") y la
// higiene del After viven en PlanCicloVidaStepDefinitions — mismo world.

When('el comercio entra al portal y abre Importar productos', { timeout: 120_000 }, async function (this: CustomWorld & SubidaState) {
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

When('abre la pestaña Pendientes de revisión', { timeout: 60_000 }, async function (this: CustomWorld & SubidaState) {
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

Given('le llega por API una línea de precio sin código de barras y con nombre inédito', { timeout: 90_000 }, async function (this: CustomWorld & SubidaState) {
  // Canal A con nombre único por corrida: si el nombre fuera fijo, la segunda
  // corrida lo hallaría publicado y el fuzzy lo vincularía solo.
  const jwt = await vendorJwt(this.vendor!);
  const keyResp = await raw(`/api/vendors/${this.vendor!.vendorId}/api-key`, { method: 'POST', token: jwt });
  const apiKey = (keyResp.data as { apiKey: string }).apiKey;
  this.skuInedito = `CONF-${Date.now()}`;
  const r = await postSignedBatch(this.vendor!.vendorId, apiKey, {
    batchId: crypto.randomUUID(), branchId: null,
    lines: [{ sku: this.skuInedito, price: 180, name: `Confirmable QA ${Date.now()}`, itbisRate: 0.18, unit: 'unidad', quantity: 1 }],
  });
  assert.strictEqual(r.sentToReview, 1, 'La línea inédita debía caer a revisión.');
});

Then('su producto inédito ofrece el botón de confirmar como producto nuevo', { timeout: 60_000 }, async function (this: CustomWorld & SubidaState) {
  assert.ok(await this.getPage(PortalSubidaPage).botonConfirmarNuevoVisible(this.skuInedito!),
    `"${this.skuInedito}" no ofrece el camino directo de confirmar — el callejón sin salida reportado.`);
});

When('lo confirma como producto nuevo', { timeout: 60_000 }, async function (this: CustomWorld & SubidaState) {
  await this.getPage(PortalSubidaPage).confirmarComoNuevo(this.skuInedito!);
});

Then('el aviso de omisiones menciona el precio vacío y el código faltante', { timeout: 60_000 }, async function (this: CustomWorld & SubidaState) {
  const avisos = await this.getPage(PortalSubidaPage).avisosDeOmision();
  assert.ok(avisos.includes('el precio está vacío'),
    `El aviso no menciona el precio vacío: "${avisos}"`);
  assert.ok(avisos.includes('falta el código'),
    `El aviso no menciona el código faltante: "${avisos}"`);
});
