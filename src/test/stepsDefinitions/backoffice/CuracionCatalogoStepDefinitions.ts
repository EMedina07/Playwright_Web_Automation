import { Given, When, Then, After } from '@cucumber/cucumber';
import assert from 'node:assert';
import { CustomWorld } from '../../../support/world';
import { getAdminToken } from '../../../../core/framework_actions/AdminSession';
import {
  provisionActiveVendor, postSignedBatch, raw, type QaVendor, type BatchResult, type Raw,
} from '../../../../core/framework_actions/TrustActions';
import {
  gtinValido, gtinInvalido, pendingCuration, curate, coverage, createSynonym,
  listSynonyms, synonymProducts, deleteSynonym, createProduct, search,
  type Coverage, type PendingCuration,
} from '../../../../core/framework_actions/CatalogActions';
import crypto from 'node:crypto';

interface CState {
  vendor?: QaVendor;
  batch?: BatchResult;
  gtin?: string;
  productId?: number;
  curacion?: Raw;
  nombreCurado?: string;
  synIds?: number[];
  lastSynonym?: Raw;
  synCreated?: { id: number; term: string; synonym: string; productCount: number };
  coverageBase?: Coverage;
  freshProductId?: number;
  freshName?: string;
}

// El comercio QA se aprovisiona UNA vez por corrida (registro + verificación
// + aprobación + MFA + API key toma segundos): los escenarios solo publican
// lotes nuevos sobre él, que es lo barato.
let cachedVendor: QaVendor | null = null;
async function qaVendor(): Promise<QaVendor> {
  cachedVendor ??= await provisionActiveVendor(await getAdminToken());
  return cachedVendor;
}

const uid = () => `${Date.now()}${crypto.randomInt(100, 999)}`;

async function publicarGtin(vendor: QaVendor, gtin: string, name: string): Promise<BatchResult> {
  return postSignedBatch(vendor.vendorId, vendor.apiKey, {
    batchId: crypto.randomUUID(),
    branchId: null,
    lines: [{ sku: `CUR-${uid()}`, price: 150, name, gtin, itbisRate: 0.18, unit: 'unidad', quantity: 1 }],
  });
}

async function pendienteDe(gtin: string): Promise<PendingCuration> {
  const r = await pendingCuration(await getAdminToken());
  assert.ok(r.ok, `pending-curation -> ${r.status}`);
  const item = (r.data as PendingCuration[]).find((p) => p.gtin === gtin);
  assert.ok(item, `El GTIN ${gtin} no apareció en la cola de curación.`);
  return item;
}

const CURACION_VALIDA = {
  name: 'Producto Curado QA',
  brand: null,
  categoryCode: 'ABARROTES',
  saleUnit: 'Unit',
  subcategoryCode: null,
  presentation: null,
};

// Higiene: un caso negativo deja su producto pendiente en la cola del admin.
// Se cura con datos válidos al salir para que la cola quede como estaba.
// Timeout generoso: getAdminToken puede esperar la próxima ventana TOTP (~30 s).
After({ timeout: 90_000 }, async function (this: CustomWorld & CState) {
  if (this.productId) {
    const token = await getAdminToken();
    const queue = await pendingCuration(token);
    if (queue.ok && (queue.data as PendingCuration[]).some((p) => p.productId === this.productId)) {
      await curate(token, this.productId, { ...CURACION_VALIDA, name: `Producto Curado QA ${uid()}` });
    }
  }
  for (const id of this.synIds ?? []) {
    await deleteSynonym(await getAdminToken(), id).catch(() => undefined);
  }
});

// ── Auto-creación → cola → curar ─────────────────────────────────────────────

Given('un comercio QA activo con API key', { timeout: 120_000 }, async function (this: CustomWorld & CState) {
  this.vendor = await qaVendor();
});

Given('un producto auto-creado pendiente de curación', { timeout: 120_000 }, async function (this: CustomWorld & CState) {
  this.vendor = await qaVendor();
  this.gtin = gtinValido();
  const batch = await publicarGtin(this.vendor, this.gtin, `Pendiente QA ${uid()}`);
  assert.strictEqual(batch.autoCreatedProducts, 1, `Debía auto-crearse 1 producto (lote: ${JSON.stringify(batch)}).`);
  this.productId = (await pendienteDe(this.gtin)).productId;
});

When('el comercio publica un producto con GTIN nuevo y nombre {string}', { timeout: 60_000 }, async function (this: CustomWorld & CState, nombre: string) {
  this.gtin = gtinValido();
  this.nombreCurado = `${nombre} ${uid()}`;
  this.batch = await publicarGtin(this.vendor!, this.gtin, this.nombreCurado);
});

When('el comercio publica un producto con GTIN inválido', { timeout: 60_000 }, async function (this: CustomWorld & CState) {
  this.batch = await publicarGtin(this.vendor!, gtinInvalido(), `Producto typo QA ${uid()} zz qq`);
});

When('el comercio publica dos líneas con el mismo GTIN nuevo', { timeout: 60_000 }, async function (this: CustomWorld & CState) {
  this.gtin = gtinValido();
  this.batch = await postSignedBatch(this.vendor!.vendorId, this.vendor!.apiKey, {
    batchId: crypto.randomUUID(),
    branchId: null,
    lines: [
      { sku: `DUP-A-${uid()}`, price: 100, name: `Duplicado QA ${uid()}`, gtin: this.gtin, itbisRate: 0.18, unit: 'unidad', quantity: 1 },
      { sku: `DUP-B-${uid()}`, price: 105, name: `Duplicado QA bis ${uid()}`, gtin: this.gtin, itbisRate: 0.18, unit: 'unidad', quantity: 1 },
    ],
  });
  this.productId = (await pendienteDe(this.gtin)).productId;
});

Then('el lote reporta 1 producto auto-creado', function (this: CustomWorld & CState) {
  assert.strictEqual(this.batch!.autoCreatedProducts, 1, `Lote: ${JSON.stringify(this.batch)}`);
});

Then('el lote reporta 0 productos auto-creados y 1 línea a revisión', function (this: CustomWorld & CState) {
  assert.strictEqual(this.batch!.autoCreatedProducts, 0, `Lote: ${JSON.stringify(this.batch)}`);
  assert.strictEqual(this.batch!.sentToReview, 1, `Lote: ${JSON.stringify(this.batch)}`);
  assert.strictEqual(this.batch!.inserted, 0, `Lote: ${JSON.stringify(this.batch)}`);
});

Then('el lote reporta 1 producto auto-creado y 2 precios publicados', function (this: CustomWorld & CState) {
  assert.strictEqual(this.batch!.autoCreatedProducts, 1, `Lote: ${JSON.stringify(this.batch)}`);
  assert.strictEqual(this.batch!.inserted, 2, `Lote: ${JSON.stringify(this.batch)}`);
});

Then('el producto aparece en la cola de curación', async function (this: CustomWorld & CState) {
  this.productId = (await pendienteDe(this.gtin!)).productId;
});

Then('el buscador del consumidor ya lo encuentra', async function (this: CustomWorld & CState) {
  const results = await search(this.nombreCurado!);
  assert.ok(results.some((p) => p.id === this.productId), `"${this.nombreCurado}" no aparece en el buscador.`);
});

When('el admin lo cura con nombre {string}, marca {string} y categoría {string}', async function (this: CustomWorld & CState, nombre: string, marca: string, categoria: string) {
  this.nombreCurado = `${nombre} ${uid()}`;
  const r = await curate(await getAdminToken(), this.productId!, {
    ...CURACION_VALIDA, name: this.nombreCurado, brand: marca, categoryCode: categoria,
  });
  assert.ok(r.ok, `Curación válida rechazada: ${r.status} ${JSON.stringify(r.data)}`);
});

Then('el producto sale de la cola de curación', async function (this: CustomWorld & CState) {
  const r = await pendingCuration(await getAdminToken());
  assert.ok(!(r.data as PendingCuration[]).some((p) => p.productId === this.productId),
    'El producto sigue en la cola tras curarlo.');
});

Then('el buscador lo encuentra con el nombre curado', async function (this: CustomWorld & CState) {
  const results = await search(this.nombreCurado!);
  assert.ok(results.some((p) => p.id === this.productId), `El nombre curado "${this.nombreCurado}" no aparece en el buscador.`);
});

Then('su GTIN no cambió', async function (this: CustomWorld & CState) {
  // La identidad es inmutable: el GTIN debe seguir resolviendo al MISMO
  // producto — publicar de nuevo con ese GTIN no crea ficha nueva.
  const batch = await publicarGtin(this.vendor!, this.gtin!, 'Reintento identidad QA');
  assert.strictEqual(batch.autoCreatedProducts, 0, 'El GTIN curado volvió a crear una ficha: la identidad cambió.');
  assert.strictEqual(batch.inserted, 1);
});

// ── Integridad al curar ──────────────────────────────────────────────────────

When('el admin intenta curarlo con nombre {string}', async function (this: CustomWorld & CState, nombre: string) {
  this.curacion = await curate(await getAdminToken(), this.productId!, { ...CURACION_VALIDA, name: nombre });
});

When('el admin lo cura con nombre {string} y categoría {string}', async function (this: CustomWorld & CState, nombre: string, categoria: string) {
  this.curacion = await curate(await getAdminToken(), this.productId!, {
    ...CURACION_VALIDA, name: nombre, categoryCode: categoria,
  });
});

When('el admin intenta curarlo con marca {string}', async function (this: CustomWorld & CState, marca: string) {
  this.curacion = await curate(await getAdminToken(), this.productId!, { ...CURACION_VALIDA, brand: marca });
});

When('el admin intenta curarlo con presentación {string}', async function (this: CustomWorld & CState, presentacion: string) {
  this.curacion = await curate(await getAdminToken(), this.productId!, { ...CURACION_VALIDA, presentation: presentacion });
});

When('el admin intenta curarlo con un nombre de 201 caracteres', async function (this: CustomWorld & CState) {
  this.curacion = await curate(await getAdminToken(), this.productId!, { ...CURACION_VALIDA, name: 'Ab'.repeat(100) + 'X' });
});

When('el admin intenta curarlo con categoría {string}', async function (this: CustomWorld & CState, categoria: string) {
  this.curacion = await curate(await getAdminToken(), this.productId!, { ...CURACION_VALIDA, categoryCode: categoria });
});

When('el admin intenta curarlo con subcategoría {string}', async function (this: CustomWorld & CState, sub: string) {
  this.curacion = await curate(await getAdminToken(), this.productId!, { ...CURACION_VALIDA, subcategoryCode: sub });
});

When('el admin intenta curar el producto {int}', async function (this: CustomWorld & CState, id: number) {
  this.curacion = await curate(await getAdminToken(), id, CURACION_VALIDA);
});

When('se intenta curar un producto sin token de admin', async function (this: CustomWorld & CState) {
  this.curacion = await raw('/api/admin/catalog/products/1', { method: 'PUT', body: CURACION_VALIDA });
});

Then('la curación se rechaza', function (this: CustomWorld & CState) {
  assert.ok(!this.curacion!.ok, `Debía rechazarse y respondió ${this.curacion!.status}.`);
});

Then('la curación se rechaza mencionando {string}', function (this: CustomWorld & CState, palabra: string) {
  const r = this.curacion!;
  assert.ok(!r.ok, `Debía rechazarse y respondió ${r.status}.`);
  const texto = JSON.stringify(r.data).toLowerCase();
  assert.ok(texto.includes(palabra.toLowerCase()),
    `El error no menciona "${palabra}": ${JSON.stringify(r.data)}`);
});

Then('la curación se acepta', function (this: CustomWorld & CState) {
  assert.ok(this.curacion!.ok, `Curación válida rechazada: ${this.curacion!.status} ${JSON.stringify(this.curacion!.data)}`);
});

Then('la petición se rechaza con 401', function (this: CustomWorld & CState) {
  assert.strictEqual(this.curacion!.status, 401);
});

// ── Sinónimos ────────────────────────────────────────────────────────────────

When('el admin crea el sinónimo {string} para {string}', async function (this: CustomWorld & CState, term: string, synonym: string) {
  const r = await createSynonym(await getAdminToken(), term, synonym);
  assert.ok(r.ok, `El sinónimo válido "${term}" se rechazó: ${r.status} ${JSON.stringify(r.data)}`);
  const row = (await listSynonyms(await getAdminToken())).find((s) => s.term === term);
  assert.ok(row, `"${term}" no aparece en el listado tras crearse.`);
  this.synCreated = row;
  (this.synIds ??= []).push(row.id);
});

Then('el sinónimo aparece listado con su conteo de productos', function (this: CustomWorld & CState) {
  assert.ok(this.synCreated!.productCount > 0,
    `"${this.synCreated!.synonym}" debía alcanzar productos (conteo=${this.synCreated!.productCount}).`);
});

Then('el conteo coincide con el buscador del consumidor y con el detalle', async function (this: CustomWorld & CState) {
  const s = this.synCreated!;
  const [buscador, detalle] = await Promise.all([
    search(s.synonym),
    synonymProducts(await getAdminToken(), s.id),
  ]);
  assert.strictEqual(s.productCount, detalle.length,
    `La columna dice ${s.productCount} pero el detalle lista ${detalle.length}.`);
  assert.strictEqual(s.productCount, buscador.length,
    `La columna dice ${s.productCount} pero el buscador del consumidor devuelve ${buscador.length}.`);
});

Then('al eliminarlo desaparece de la lista', async function (this: CustomWorld & CState) {
  const token = await getAdminToken();
  const del = await deleteSynonym(token, this.synCreated!.id);
  assert.ok(del.ok, `DELETE -> ${del.status}`);
  const listado = await listSynonyms(token);
  assert.ok(!listado.some((s) => s.id === this.synCreated!.id), 'El sinónimo sigue en la lista tras eliminarlo.');
  this.synIds = this.synIds?.filter((id) => id !== this.synCreated!.id);
});

When('el admin intenta crear el sinónimo {string} para {string}', async function (this: CustomWorld & CState, term: string, synonym: string) {
  this.lastSynonym = await createSynonym(await getAdminToken(), term, synonym);
});

When('el admin intenta crear un sinónimo con término de 81 caracteres', async function (this: CustomWorld & CState) {
  this.lastSynonym = await createSynonym(await getAdminToken(), 'ab'.repeat(40) + 'x', 'pasta dental');
});

Then('el sinónimo se rechaza', function (this: CustomWorld & CState) {
  assert.ok(!this.lastSynonym!.ok, `Debía rechazarse y respondió ${this.lastSynonym!.status}.`);
});

Then('intentar crear {string} de nuevo se rechaza', async function (this: CustomWorld & CState, term: string) {
  const r = await createSynonym(await getAdminToken(), term, 'arroz blanco');
  assert.ok(!r.ok, `El término duplicado "${term}" se aceptó (${r.status}).`);
});

Then('intentar crear {string} con tilde también se rechaza', async function (this: CustomWorld & CState, term: string) {
  const r = await createSynonym(await getAdminToken(), term, 'arroz blanco');
  assert.ok(!r.ok, `El término con tilde "${term}" burló la unicidad (${r.status}).`);
});

// ── Cobertura de precios ─────────────────────────────────────────────────────

Given('la cobertura actual está anotada', async function (this: CustomWorld & CState) {
  this.coverageBase = await coverage(await getAdminToken());
});

Then('la cobertura cumple: con precio + sin precio = total, y el detalle lista exactamente los sin precio', async function (this: CustomWorld & CState) {
  const c = await coverage(await getAdminToken());
  assert.strictEqual(c.withPrice + c.withoutPrice, c.totalProducts,
    `withPrice(${c.withPrice}) + withoutPrice(${c.withoutPrice}) != total(${c.totalProducts})`);
  assert.strictEqual(c.uncovered.length, c.withoutPrice,
    `El detalle lista ${c.uncovered.length} pero withoutPrice dice ${c.withoutPrice}.`);
});

Then('el total de productos subió en 1 sin abrir huecos nuevos', async function (this: CustomWorld & CState) {
  const base = this.coverageBase!;
  const c = await coverage(await getAdminToken());
  assert.strictEqual(c.totalProducts, base.totalProducts + 1,
    `Total esperado ${base.totalProducts + 1}, real ${c.totalProducts}.`);
  assert.strictEqual(c.withoutPrice, base.withoutPrice,
    `El producto nuevo abrió un hueco: withoutPrice pasó de ${base.withoutPrice} a ${c.withoutPrice}.`);
});

When('el admin crea a mano un producto fresco sin precio', async function (this: CustomWorld & CState) {
  this.freshName = `Yautia Cobertura QA ${uid()}`;
  const r = await createProduct(await getAdminToken(), {
    kind: 'Fresh', gtin: null, canonicalCode: `FRESH-QA-${uid()}`, name: this.freshName,
    categoryCode: 'VIVERES', saleUnit: 'Pound', brand: null, subcategoryCode: null, presentation: null,
  });
  assert.ok(r.ok, `Crear el fresco falló: ${r.status} ${JSON.stringify(r.data)}`);
  this.freshProductId = (r.data as { productId: number }).productId;
});

Then('la cobertura muestra 1 producto más sin precio y lo lista en el detalle', async function (this: CustomWorld & CState) {
  const base = this.coverageBase!;
  const c = await coverage(await getAdminToken());
  assert.strictEqual(c.withoutPrice, base.withoutPrice + 1,
    `withoutPrice esperado ${base.withoutPrice + 1}, real ${c.withoutPrice}.`);
  assert.ok(c.uncovered.some((u) => u.productId === this.freshProductId),
    'El fresco sin precio no aparece en el detalle de huecos.');
});

When('el comercio publica ese producto fresco por nombre', { timeout: 60_000 }, async function (this: CustomWorld & CState) {
  // Sin GTIN: la línea llega con el MISMO nombre del canónico y el fuzzy la
  // vincula solo (similitud 1.0 ≥ 0.85) — el camino real de los frescos.
  const batch = await postSignedBatch(this.vendor!.vendorId, this.vendor!.apiKey, {
    batchId: crypto.randomUUID(),
    branchId: null,
    lines: [{ sku: `FRQ-${uid()}`, price: 65, name: this.freshName, itbisRate: 0, unit: 'libra', quantity: 1 }],
  });
  assert.strictEqual(batch.inserted, 1, `El fresco no se publicó: ${JSON.stringify(batch)}`);
  assert.strictEqual(batch.autoCreatedProducts, 0, 'Publicar el fresco no debía crear ficha nueva.');
});

Then('la cobertura vuelve a cuadrar sin ese hueco', async function (this: CustomWorld & CState) {
  const base = this.coverageBase!;
  const c = await coverage(await getAdminToken());
  assert.strictEqual(c.withoutPrice, base.withoutPrice,
    `withoutPrice esperado ${base.withoutPrice}, real ${c.withoutPrice}.`);
  assert.ok(!c.uncovered.some((u) => u.productId === this.freshProductId),
    'El fresco sigue listado como hueco tras publicarse.');
});
