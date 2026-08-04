import { Given, When, Then, After } from '@cucumber/cucumber';
import assert from 'node:assert';
import { CustomWorld } from '../../../support/world';
import { getAdminToken } from '../../../../core/framework_actions/AdminSession';
import {
  provisionActiveVendor, moderate, type QaVendor, type Raw,
} from '../../../../core/framework_actions/TrustActions';
import {
  vendorJwt, addCard, createPromotion, myPromotions, quote, deactivate, reactivate,
  adminDeactivate, adminReactivate, getSettings, putSettings, publicSettings, nearby,
  isoInDays, nuevoCaption, type PromoSettings, type PromotionRow,
} from '../../../../core/framework_actions/PromotionActions';

interface PState {
  vendor?: QaVendor;
  settingsBase?: PromoSettings;
  settingsRestored?: boolean;
  lastCreate?: Raw;
  lastRaw?: Raw;
  captionIntentado?: string;
  promoId?: number;
  promoCaption?: string;
  createdPromos?: { vendor: QaVendor; id: number }[];
  captions?: Record<string, number>;
}

// Dos comercios cacheados por corrida: uno CON tarjeta y uno SIN — la regla
// "sin tarjeta no hay pauta paga" exige que el segundo jamás registre una.
let vendorConTarjeta: QaVendor | null = null;
let vendorSinTarjeta: QaVendor | null = null;

async function conTarjeta(): Promise<QaVendor> {
  if (!vendorConTarjeta) {
    vendorConTarjeta = await provisionActiveVendor(await getAdminToken());
    await addCard(vendorConTarjeta);
  }
  return vendorConTarjeta;
}

async function sinTarjeta(): Promise<QaVendor> {
  vendorSinTarjeta ??= await provisionActiveVendor(await getAdminToken());
  return vendorSinTarjeta;
}

async function promoDe(v: QaVendor, id: number): Promise<PromotionRow> {
  const row = (await myPromotions(v)).find((p) => p.id === id);
  assert.ok(row, `La promoción ${id} no aparece en la lista del comercio.`);
  return row;
}

// Higiene: las promos que la corrida deja ACTIVAS se desactivan al salir para
// no ensuciar el carrusel del consumidor; la configuración global SIEMPRE se
// restaura aunque el escenario haya fallado a mitad.
// Timeout generoso: getAdminToken puede esperar la próxima ventana TOTP
// (~30 s) y el default de cucumber mataría el hook a mitad de la restauración.
After({ timeout: 90_000 }, async function (this: CustomWorld & PState) {
  for (const { vendor, id } of this.createdPromos ?? []) {
    const row = (await myPromotions(vendor).catch(() => [])).find((p) => p.id === id);
    if (row?.isActive) {
      await deactivate(vendor, id).catch(() => undefined);
    }
  }
  if (this.settingsBase && !this.settingsRestored) {
    await putSettings(await getAdminToken(),
      this.settingsBase.intervalSeconds, this.settingsBase.advertisingPricePerDayCents);
  }
});

// ── Configuración ────────────────────────────────────────────────────────────

Given('la configuración de promociones está anotada', async function (this: CustomWorld & PState) {
  this.settingsBase = await getSettings(await getAdminToken());
  this.settingsRestored = false;
});

When('el admin fija el intervalo en {int} segundos y el precio por día en RD${int}', async function (this: CustomWorld & PState, interval: number, pesos: number) {
  const r = await putSettings(await getAdminToken(), interval, pesos * 100);
  assert.ok(r.ok, `Configuración válida rechazada: ${r.status} ${JSON.stringify(r.data)}`);
});

// La configuración es GLOBAL y editable por un humano en cualquier momento:
// el escenario que depende de "la pauta cuesta" lo garantiza, no lo asume.
Given('la pauta tiene un precio por día mayor que cero', async function (this: CustomWorld & PState) {
  const token = await getAdminToken();
  if (this.settingsBase!.advertisingPricePerDayCents === 0) {
    const r = await putSettings(token, this.settingsBase!.intervalSeconds, 50_000);
    assert.ok(r.ok, `No se pudo dar precio a la pauta: ${r.status}`);
  }
});

Given('el admin fija el precio por día en 0', async function (this: CustomWorld & PState) {
  const r = await putSettings(await getAdminToken(), this.settingsBase!.intervalSeconds, 0);
  assert.ok(r.ok, `No se pudo poner la pauta gratis: ${r.status}`);
});

Then('la configuración pública refleja intervalo {int} y precio {int} centavos', async function (this: CustomWorld & PState, interval: number, cents: number) {
  const pub = await publicSettings();
  assert.strictEqual(pub.intervalSeconds, interval);
  assert.strictEqual(pub.advertisingPricePerDayCents, cents);
});

Then('se restaura la configuración original', async function (this: CustomWorld & PState) {
  const base = this.settingsBase!;
  const r = await putSettings(await getAdminToken(), base.intervalSeconds, base.advertisingPricePerDayCents);
  assert.ok(r.ok, `No se pudo restaurar la configuración: ${r.status}`);
  this.settingsRestored = true;
});

When('el admin intenta fijar intervalo {int} y precio {int} centavos', async function (this: CustomWorld & PState, interval: number, cents: number) {
  this.lastRaw = await putSettings(await getAdminToken(), interval, cents);
});

Then('la configuración se rechaza', function (this: CustomWorld & PState) {
  assert.ok(!this.lastRaw!.ok, `Debía rechazarse y respondió ${this.lastRaw!.status}.`);
});

// ── Comercios ────────────────────────────────────────────────────────────────

Given('un comercio QA de promociones con tarjeta', { timeout: 120_000 }, async function (this: CustomWorld & PState) {
  this.vendor = await conTarjeta();
});

Given('un comercio QA de promociones sin tarjeta', { timeout: 120_000 }, async function (this: CustomWorld & PState) {
  this.vendor = await sinTarjeta();
});

Given('un comercio QA suspendido por el admin', { timeout: 120_000 }, async function (this: CustomWorld & PState) {
  const adminToken = await getAdminToken();
  const v = await provisionActiveVendor(adminToken);
  await vendorJwt(v); // el JWT se obtiene ANTES: suspendido ya no puede loguear
  await moderate(adminToken, v.vendorId, 'suspend', 'QA promociones: comercio suspendido');
  this.vendor = v;
});

// ── Cotización ───────────────────────────────────────────────────────────────

Then('la cotización de hoy a hoy es de 1 día', async function (this: CustomWorld & PState) {
  const q = await quote(this.vendor!, isoInDays(0), isoInDays(0));
  assert.strictEqual(q.days, 1);
  assert.strictEqual(q.totalCents, q.pricePerDayCents);
});

Then('la cotización de hoy a dentro de 4 días es de 5 días y cuadra con el precio configurado', async function (this: CustomWorld & PState) {
  const [q, settings] = await Promise.all([
    quote(this.vendor!, isoInDays(0), isoInDays(4)),
    getSettings(await getAdminToken()),
  ]);
  assert.strictEqual(q.days, 5);
  assert.strictEqual(q.pricePerDayCents, settings.advertisingPricePerDayCents,
    'La cotización no usa el precio por día configurado.');
  assert.strictEqual(q.totalCents, q.days * q.pricePerDayCents);
});

// ── Publicación ──────────────────────────────────────────────────────────────

When('publica una promoción de {int} días con texto {string}', async function (this: CustomWorld & PState, dias: number, texto: string) {
  this.captionIntentado = nuevoCaption(texto);
  this.lastCreate = await createPromotion(this.vendor!, {
    caption: this.captionIntentado, startsOn: isoInDays(0), endsOn: isoInDays(dias - 1),
  });
});

When('intenta publicar una promoción de {int} día', async function (this: CustomWorld & PState, dias: number) {
  this.captionIntentado = nuevoCaption('Intento');
  this.lastCreate = await createPromotion(this.vendor!, {
    caption: this.captionIntentado, startsOn: isoInDays(0), endsOn: isoInDays(dias - 1),
  });
});

When('intenta publicar con inicio {int} y fin {int}', async function (this: CustomWorld & PState, inicio: number, fin: number) {
  this.lastCreate = await createPromotion(this.vendor!, {
    caption: nuevoCaption('Fechas'), startsOn: isoInDays(inicio), endsOn: isoInDays(fin),
  });
});

When('intenta publicar con texto vacío', async function (this: CustomWorld & PState) {
  this.lastCreate = await createPromotion(this.vendor!, { caption: '' });
});

When('intenta publicar con un texto de 281 caracteres', async function (this: CustomWorld & PState) {
  this.lastCreate = await createPromotion(this.vendor!, { caption: 'a'.repeat(281) });
});

When('intenta publicar para la sucursal {int}', async function (this: CustomWorld & PState, branchId: number) {
  this.lastCreate = await createPromotion(this.vendor!, { caption: nuevoCaption('Sucursal'), branchIds: [branchId] });
});

When('intenta publicar sin imagen', async function (this: CustomWorld & PState) {
  this.lastCreate = await createPromotion(this.vendor!, { caption: nuevoCaption('SinImagen'), image: null });
});

When('intenta publicar con un archivo de texto como imagen', async function (this: CustomWorld & PState) {
  this.lastCreate = await createPromotion(this.vendor!, {
    caption: nuevoCaption('Texto'), image: Buffer.from('no soy una imagen'), contentType: 'text/plain',
  });
});

When('intenta publicar con una imagen de 4 MB', { timeout: 30_000 }, async function (this: CustomWorld & PState) {
  this.lastCreate = await createPromotion(this.vendor!, {
    caption: nuevoCaption('Gorda'), image: Buffer.alloc(4 * 1024 * 1024, 7),
  });
});

Then('la publicación se rechaza', function (this: CustomWorld & PState) {
  assert.ok(!this.lastCreate!.ok, `Debía rechazarse y respondió ${this.lastCreate!.status}.`);
});

Then('la publicación se rechaza mencionando {string}', function (this: CustomWorld & PState, palabra: string) {
  const r = this.lastCreate!;
  assert.ok(!r.ok, `Debía rechazarse y respondió ${r.status}.`);
  assert.ok(JSON.stringify(r.data).toLowerCase().includes(palabra.toLowerCase()),
    `El error no menciona "${palabra}": ${JSON.stringify(r.data)}`);
});

Then('la promoción queda publicada y activa en su lista', async function (this: CustomWorld & PState) {
  const r = this.lastCreate!;
  assert.ok(r.ok, `La publicación válida se rechazó: ${r.status} ${JSON.stringify(r.data)}`);
  const id = (r.data as { promotionId: number }).promotionId;
  const row = await promoDe(this.vendor!, id);
  assert.ok(row.isActive, 'La promoción recién publicada no está activa.');
  assert.strictEqual(row.caption, this.captionIntentado);
  (this.createdPromos ??= []).push({ vendor: this.vendor!, id });
});

Then('no le queda ninguna promoción publicada', async function (this: CustomWorld & PState) {
  const list = await myPromotions(this.vendor!);
  assert.ok(!list.some((p) => p.caption === this.captionIntentado),
    'La promoción rechazada quedó publicada de todas formas.');
});

// ── Nearby (lo que ve el consumidor) ─────────────────────────────────────────

When('publica una promoción vigente con texto {string}', async function (this: CustomWorld & PState, texto: string) {
  const caption = nuevoCaption(texto);
  const r = await createPromotion(this.vendor!, { caption, startsOn: isoInDays(0), endsOn: isoInDays(1) });
  assert.ok(r.ok, `No se pudo publicar "${texto}": ${r.status} ${JSON.stringify(r.data)}`);
  (this.captions ??= {})[texto] = (r.data as { promotionId: number }).promotionId;
  (this.createdPromos ??= []).push({ vendor: this.vendor!, id: this.captions[texto] });
});

When('publica una promoción que empieza en 10 días con texto {string}', async function (this: CustomWorld & PState, texto: string) {
  const caption = nuevoCaption(texto);
  const r = await createPromotion(this.vendor!, { caption, startsOn: isoInDays(10), endsOn: isoInDays(11) });
  assert.ok(r.ok, `No se pudo publicar "${texto}": ${r.status} ${JSON.stringify(r.data)}`);
  (this.captions ??= {})[texto] = (r.data as { promotionId: number }).promotionId;
  (this.createdPromos ??= []).push({ vendor: this.vendor!, id: this.captions[texto] });
});

Then('el carrusel cercano muestra {string} y no muestra {string}', async function (this: CustomWorld & PState, visible: string, oculta: string) {
  const feed = await nearby();
  assert.ok(feed.some((p) => p.id === this.captions![visible]),
    `"${visible}" no aparece en el carrusel cercano.`);
  assert.ok(!feed.some((p) => p.id === this.captions![oculta]),
    `"${oculta}" aparece en el carrusel aunque su campaña no ha empezado.`);
});

When('el comercio desactiva la promoción {string}', async function (this: CustomWorld & PState, texto: string) {
  const r = await deactivate(this.vendor!, this.captions![texto]);
  assert.ok(r.ok, `Desactivar falló: ${r.status}`);
});

Then('el carrusel cercano tampoco muestra {string}', async function (this: CustomWorld & PState, texto: string) {
  const feed = await nearby();
  assert.ok(!feed.some((p) => p.id === this.captions![texto]),
    `"${texto}" sigue en el carrusel tras desactivarse.`);
});

// ── Desactivar / Reactivar ───────────────────────────────────────────────────

Given('una promoción vigente publicada', async function (this: CustomWorld & PState) {
  this.promoCaption = nuevoCaption('Campaña');
  const r = await createPromotion(this.vendor!, {
    caption: this.promoCaption, startsOn: isoInDays(0), endsOn: isoInDays(1),
  });
  assert.ok(r.ok, `No se pudo publicar la campaña base: ${r.status} ${JSON.stringify(r.data)}`);
  this.promoId = (r.data as { promotionId: number }).promotionId;
  (this.createdPromos ??= []).push({ vendor: this.vendor!, id: this.promoId });
});

When('el comercio la desactiva', async function (this: CustomWorld & PState) {
  const r = await deactivate(this.vendor!, this.promoId!);
  assert.ok(r.ok, `Desactivar falló: ${r.status}`);
});

When('el comercio la reactiva', async function (this: CustomWorld & PState) {
  const r = await reactivate(this.vendor!, this.promoId!);
  assert.ok(r.ok, `Reactivar falló: ${r.status} ${JSON.stringify(r.data)}`);
});

Then('su lista la muestra desactivada por {string}', async function (this: CustomWorld & PState, actor: string) {
  const row = await promoDe(this.vendor!, this.promoId!);
  assert.strictEqual(row.isActive, false, 'Debía estar desactivada.');
  assert.strictEqual(row.deactivatedBy, actor);
});

Then('su lista la muestra activa', async function (this: CustomWorld & PState) {
  const row = await promoDe(this.vendor!, this.promoId!);
  assert.strictEqual(row.isActive, true, 'Debía estar activa.');
  assert.strictEqual(row.deactivatedBy, null);
});

When('el admin la desactiva con motivo {string}', async function (this: CustomWorld & PState, motivo: string) {
  const r = await adminDeactivate(await getAdminToken(), this.promoId!, motivo);
  assert.ok(r.ok, `Moderar falló: ${r.status} ${JSON.stringify(r.data)}`);
});

Then('el comercio no puede reactivarla y el error menciona {string}', async function (this: CustomWorld & PState, palabra: string) {
  const r = await reactivate(this.vendor!, this.promoId!);
  assert.ok(!r.ok, `El comercio revivió una moderación (${r.status}).`);
  assert.ok(JSON.stringify(r.data).toLowerCase().includes(palabra.toLowerCase()),
    `El error no menciona "${palabra}": ${JSON.stringify(r.data)}`);
});

When('el admin la reactiva', async function (this: CustomWorld & PState) {
  const r = await adminReactivate(await getAdminToken(), this.promoId!);
  assert.ok(r.ok, `Reactivar (admin) falló: ${r.status} ${JSON.stringify(r.data)}`);
});

When('el admin intenta desactivarla sin motivo', async function (this: CustomWorld & PState) {
  this.lastRaw = await adminDeactivate(await getAdminToken(), this.promoId!, null);
});

Then('la moderación de la promoción se rechaza', function (this: CustomWorld & PState) {
  assert.ok(!this.lastRaw!.ok, `Debía rechazarse y respondió ${this.lastRaw!.status}.`);
});

When('el comercio intenta reactivarla estando activa', async function (this: CustomWorld & PState) {
  this.lastRaw = await reactivate(this.vendor!, this.promoId!);
});

Then('la reactivación se rechaza', function (this: CustomWorld & PState) {
  assert.ok(!this.lastRaw!.ok, `Debía rechazarse y respondió ${this.lastRaw!.status}.`);
});
