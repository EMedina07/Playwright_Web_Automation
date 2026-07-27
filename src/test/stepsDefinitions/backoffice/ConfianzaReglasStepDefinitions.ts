import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert';
import { CustomWorld } from '../../../support/world';
import { getAdminToken } from '../../../../core/framework_actions/AdminSession';
import {
  publishProducts, registerConsumer, deleteConsumer, report, raw,
  reportFromDistinctConsumers, moderate, complaintDetail, vendorStatus,
  postSignedBatch, typicalPrice, type QaVendor,
} from '../../../../core/framework_actions/TrustActions';

interface RState {
  vendor?: QaVendor;
  registered?: number;
  lastRaw?: { status: number; ok: boolean; title?: string };
  firstConsumer?: { token: string; phone: string };
}

// Catálogo real (id, gtin) para publicar varios productos reportables.
const EXTRA_PRODUCTS: [number, string][] = [
  [1, '7460001000134'], [2, '7460001000011'], [3, '7460001000110'], [4, '7460001000080'],
  [5, '7460001000097'], [6, '7460001000042'], [7, '7460001000073'], [8, '7460001000127'],
];

// NB: "un comercio de prueba activo y publicado" se define en ConfianzaStepDefinitions.

Given('el comercio publica 8 productos más', { timeout: 40_000 }, async function (this: CustomWorld) {
  const s = this as CustomWorld & RState;
  const batch = await publishProducts(s.vendor!, EXTRA_PRODUCTS);
  assert.ok(batch.inserted >= 5, `Debían publicarse ≥5 productos (insertados=${batch.inserted}, revisión=${batch.sentToReview}, cuarentena=${batch.quarantined}).`);
});

When('2 consumidores reportan {string} en todos los productos publicados', { timeout: 40_000 }, async function (this: CustomWorld, _label: string) {
  const s = this as CustomWorld & RState;
  const ids = [s.vendor!.productId, ...EXTRA_PRODUCTS.map(([id]) => id)];
  const c1 = await registerConsumer(); const c2 = await registerConsumer();
  let n = 0;
  for (const pid of ids) {
    for (const c of [c1, c2]) {
      const r = await report(c.token, s.vendor!.vendorId, pid, { seenPrice: 890500 }).catch(() => ({ registered: false }));
      if ((r as any).registered) n++;
    }
  }
  s.registered = n;
});

When('2 consumidores reportan 5 productos distintos cada uno', { timeout: 40_000 }, async function (this: CustomWorld) {
  const s = this as CustomWorld & RState;
  const ids = [s.vendor!.productId, ...EXTRA_PRODUCTS.map(([id]) => id)].slice(0, 5);
  const c1 = await registerConsumer(); const c2 = await registerConsumer();
  for (const pid of ids) for (const c of [c1, c2]) await report(c.token, s.vendor!.vendorId, pid, { seenPrice: 890500 }).catch(() => undefined);
});

When('{int} consumidores distintos reportan {string}', { timeout: 40_000 }, async function (this: CustomWorld, count: number, label: string) {
  const s = this as CustomWorld & RState;
  const matched = label.includes('sí');
  for (let i = 0; i < count; i++) {
    const c = await registerConsumer();
    await report(c.token, s.vendor!.vendorId, s.vendor!.productId, { matched, seenPrice: 890150 + i });
  }
});

Given('un consumidor reporta y luego elimina su cuenta', { timeout: 30_000 }, async function (this: CustomWorld) {
  const s = this as CustomWorld & RState;
  const phone = `+1829${String(Date.now()).slice(-7)}`;
  const c = await registerConsumer(phone);
  s.firstConsumer = c;
  const r = await report(c.token, s.vendor!.vendorId, s.vendor!.productId, { seenPrice: 890200 });
  assert.ok(r.registered, 'El primer reporte debía registrarse.');
  await deleteConsumer(c.token);
});

When('re-crea la cuenta con el mismo teléfono y vuelve a reportar el mismo producto', { timeout: 30_000 }, async function (this: CustomWorld) {
  const s = this as CustomWorld & RState;
  const c2 = await registerConsumer(s.firstConsumer!.phone);
  const r2 = await report(c2.token, s.vendor!.vendorId, s.vendor!.productId, { seenPrice: 890210 });
  s.registered = r2.registered ? 1 : 0;
});

// ── Casos negativos ──────────────────────────────────────────────────────────

When('se reporta sin sesión de consumidor', async function (this: CustomWorld) {
  const s = this as CustomWorld & RState;
  s.lastRaw = await raw('/api/reports/price-check', { method: 'POST', body: { vendorId: s.vendor!.vendorId, productId: s.vendor!.productId, matched: false, seenPrice: 120 } });
});

When('un consumidor reporta un producto que el comercio no publica', async function (this: CustomWorld) {
  const s = this as CustomWorld & RState;
  const c = await registerConsumer();
  // Producto 999999 no existe / no lo publica → debe rechazarse.
  s.lastRaw = await raw('/api/reports/price-check', { method: 'POST', token: c.token, body: { vendorId: s.vendor!.vendorId, productId: 999999, matched: false, seenPrice: 120 } });
});

When('un consumidor reporta con precio visto {int}', async function (this: CustomWorld, precio: number) {
  const s = this as CustomWorld & RState;
  const c = await registerConsumer();
  s.lastRaw = await raw('/api/reports/price-check', { method: 'POST', token: c.token, body: { vendorId: s.vendor!.vendorId, productId: s.vendor!.productId, matched: false, seenPrice: precio } });
});

When('el admin intenta suspender al comercio sin motivo', async function (this: CustomWorld) {
  const s = this as CustomWorld & RState;
  const token = await getAdminToken();
  s.lastRaw = await moderate(token, s.vendor!.vendorId, 'suspend');
});

When('el admin intenta reactivar un comercio ya activo', async function (this: CustomWorld) {
  const s = this as CustomWorld & RState;
  const token = await getAdminToken();
  s.lastRaw = await moderate(token, s.vendor!.vendorId, 'activate');
});

When('el admin intenta suspender un comercio inexistente', async function (this: CustomWorld) {
  const token = await getAdminToken();
  (this as CustomWorld & RState).lastRaw = await moderate(token, 999_999, 'suspend', 'QA inexistente');
});

// ── Bugs (quedan en rojo) ────────────────────────────────────────────────────

Given('el comercio queda suspendido por el admin', async function (this: CustomWorld) {
  const s = this as CustomWorld & RState;
  const token = await getAdminToken();
  await moderate(token, s.vendor!.vendorId, 'suspend', 'QA BUG-1');
});

When('el comercio intenta subir precios por su API key en el Canal A', async function (this: CustomWorld) {
  const s = this as CustomWorld & RState;
  const v = s.vendor!;
  const res = await postSignedBatch(v.vendorId, v.apiKey, {
    batchId: crypto.randomUUID(), branchId: null,
    lines: [{ sku: '7460001001247', price: typicalPrice(121), name: 'Leche UHT Laval entera 1 L', gtin: '7460001001247', itbisRate: 0.18, unit: 'unidad', quantity: 1 }],
  }).then((r) => ({ accepted: true, r })).catch(() => ({ accepted: false }));
  (s as any).ingestAccepted = res.accepted;
});

Given('un consumidor reporta que el precio {string}', async function (this: CustomWorld, label: string) {
  const s = this as CustomWorld & RState;
  const c = await registerConsumer();
  s.firstConsumer = c;
  const matched = label.includes('sí');
  await report(c.token, s.vendor!.vendorId, s.vendor!.productId, { matched, seenPrice: 890120 });
});

When('el mismo consumidor reporta que el precio {string} el mismo día', async function (this: CustomWorld, label: string) {
  const s = this as CustomWorld & RState;
  const matched = label.includes('sí');
  const r = await report(s.firstConsumer!.token, s.vendor!.vendorId, s.vendor!.productId, { matched, seenPrice: 890130 });
  s.registered = r.registered ? 1 : 0;
});

// ── Aserciones ───────────────────────────────────────────────────────────────

Then('se registraron al menos 5 reportes', function (this: CustomWorld) {
  const s = this as CustomWorld & RState;
  assert.ok((s.registered ?? 0) >= 5, `Debían registrarse ≥5 reportes; hubo ${s.registered}.`);
});

Then('el comercio sigue activo', { timeout: 20_000 }, async function (this: CustomWorld) {
  const s = this as CustomWorld & RState;
  const token = await getAdminToken();
  assert.strictEqual(await vendorStatus(token, s.vendor!.vendorId), 'Active', 'El comercio debía seguir activo.');
});

Then('el comercio queda suspendido', { timeout: 20_000 }, async function (this: CustomWorld) {
  const s = this as CustomWorld & RState;
  const token = await getAdminToken();
  assert.strictEqual(await vendorStatus(token, s.vendor!.vendorId), 'Suspended', 'El comercio debía quedar suspendido.');
});

Then('el panel no lista al comercio con quejas', async function (this: CustomWorld) {
  const s = this as CustomWorld & RState;
  const token = await getAdminToken();
  const det = await complaintDetail(token, s.vendor!.vendorId);
  const mismatches = det?.recentReports?.filter((r: any) => !r.matched).length ?? 0;
  assert.strictEqual(mismatches, 0, 'No debía haber reportes de "no coincidió" (los "sí coincidió" no cuentan).');
});

Then('el segundo reporte no se registra', function (this: CustomWorld) {
  assert.strictEqual((this as CustomWorld & RState).registered, 0, 'El segundo reporte (mismo teléfono) NO debía registrarse.');
});

Then('el panel cuenta un solo reportante', async function (this: CustomWorld) {
  const s = this as CustomWorld & RState;
  const token = await getAdminToken();
  const det = await complaintDetail(token, s.vendor!.vendorId);
  assert.strictEqual(det?.distinctReporters, 1, `El panel debía contar 1 reportante; contó ${det?.distinctReporters}.`);
});

Then('el reporte se rechaza con {int}', function (this: CustomWorld, code: number) {
  const s = this as CustomWorld & RState;
  assert.strictEqual(s.lastRaw?.status, code, `Esperaba HTTP ${code}; recibí ${s.lastRaw?.status}.`);
});

Then('el reporte se rechaza', function (this: CustomWorld) {
  const s = this as CustomWorld & RState;
  assert.ok(s.lastRaw && !s.lastRaw.ok, `El reporte debía rechazarse; recibí HTTP ${s.lastRaw?.status}.`);
});

Then('la moderación se rechaza', function (this: CustomWorld) {
  const s = this as CustomWorld & RState;
  assert.ok(s.lastRaw && !s.lastRaw.ok, `La moderación debía rechazarse; recibí HTTP ${s.lastRaw?.status} ("${s.lastRaw?.title ?? ''}").`);
});

Then('el canal de ingesta debería rechazar el lote del comercio suspendido', function (this: CustomWorld) {
  // BUG-1 CORREGIDO: el filtro de API key ahora valida el estado del comercio.
  assert.strictEqual((this as any).ingestAccepted, false,
    'BUG-1: un comercio suspendido no debería poder subir precios por su API key.');
});

Then('el reporte de "no coincidió" debería quedar registrado', function (this: CustomWorld) {
  // BUG-2 CORREGIDO: el dedupe ahora distingue el veredicto.
  assert.strictEqual((this as CustomWorld & RState).registered, 1,
    'BUG-2: el "no coincidió" debe registrarse aunque haya un "coincidió" del mismo día.');
});

// ── Casos edge/negativos nuevos ───────────────────────────────────────────────

// 5 reportes de EXACTAMENTE 3 consumidores distintos (c1 en 3 productos, c2 y c3
// en 1 cada uno) → cruza el umbral (≥5 reportes Y ≥3 consumidores).
When('3 consumidores distintos generan 5 reportes de "no coincidió"', { timeout: 40_000 }, async function (this: CustomWorld) {
  const s = this as CustomWorld & RState;
  const ids = [s.vendor!.productId, ...EXTRA_PRODUCTS.map(([id]) => id)];
  const c1 = await registerConsumer(); const c2 = await registerConsumer(); const c3 = await registerConsumer();
  await report(c1.token, s.vendor!.vendorId, ids[0], { seenPrice: 890500 });
  await report(c1.token, s.vendor!.vendorId, ids[1], { seenPrice: 890501 });
  await report(c1.token, s.vendor!.vendorId, ids[2], { seenPrice: 890502 });
  await report(c2.token, s.vendor!.vendorId, ids[0], { seenPrice: 890503 });
  await report(c3.token, s.vendor!.vendorId, ids[0], { seenPrice: 890504 });
});

When('el admin intenta suspender al comercio de nuevo', async function (this: CustomWorld) {
  const s = this as CustomWorld & RState;
  const token = await getAdminToken();
  s.lastRaw = await moderate(token, s.vendor!.vendorId, 'suspend', 'QA doble suspensión');
});

When('el admin reactiva al comercio', { timeout: 20_000 }, async function (this: CustomWorld) {
  const s = this as CustomWorld & RState;
  const token = await getAdminToken();
  await moderate(token, s.vendor!.vendorId, 'activate', 'QA reactivación de ciclo');
});

When('un consumidor reporta con precio visto válido {int}', async function (this: CustomWorld, precio: number) {
  const s = this as CustomWorld & RState;
  const c = await registerConsumer();
  s.lastRaw = await raw('/api/reports/price-check', { method: 'POST', token: c.token, body: { vendorId: s.vendor!.vendorId, productId: s.vendor!.productId, matched: false, seenPrice: precio } });
});

When('un consumidor reporta al comercio suspendido', async function (this: CustomWorld) {
  const s = this as CustomWorld & RState;
  const c = await registerConsumer();
  s.lastRaw = await raw('/api/reports/price-check', { method: 'POST', token: c.token, body: { vendorId: s.vendor!.vendorId, productId: s.vendor!.productId, matched: false, seenPrice: 130 } });
});

Then('el reporte se acepta', function (this: CustomWorld) {
  const s = this as CustomWorld & RState;
  assert.ok(s.lastRaw && s.lastRaw.ok, `El reporte debía aceptarse; recibí HTTP ${s.lastRaw?.status} ("${s.lastRaw?.title ?? ''}").`);
});

// ── Regresiones BUG-4 (dispositivos) y BUG-5 (precio menor) ──────────────────

// 5 cuentas distintas pero UN solo dispositivo: sin ≥3 dispositivos distintos
// el comercio no se suspende, aunque haya 5 reportes de 5 consumidores.
When('5 consumidores distintos reportan {string} desde el mismo dispositivo', { timeout: 40_000 }, async function (this: CustomWorld, _label: string) {
  const s = this as CustomWorld & RState;
  for (let i = 0; i < 5; i++) {
    const c = await registerConsumer();
    await report(c.token, s.vendor!.vendorId, s.vendor!.productId, { seenPrice: 890300 + i, deviceId: 'qa-device-COMPARTIDO' });
  }
});

// Pagar MENOS que lo publicado no perjudica al consumidor: el "no coincidió"
// no se registra ni cuenta para la suspensión.
When('un consumidor reporta {string} pagando menos que lo publicado', { timeout: 30_000 }, async function (this: CustomWorld, _label: string) {
  const s = this as CustomWorld & RState;
  const c = await registerConsumer();
  const r = await report(c.token, s.vendor!.vendorId, s.vendor!.productId, { seenPrice: 1 });
  s.registered = r.registered ? 1 : 0;
});

Then('el reporte no queda registrado', function (this: CustomWorld) {
  assert.strictEqual((this as CustomWorld & RState).registered, 0,
    'Un "no coincidió" pagando MENOS que lo publicado no debía registrarse.');
});
