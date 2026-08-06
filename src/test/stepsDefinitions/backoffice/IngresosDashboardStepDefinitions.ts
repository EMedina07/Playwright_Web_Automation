import { Given, When, Then, After } from '@cucumber/cucumber';
import assert from 'node:assert';
import { CustomWorld } from '../../../support/world';
import { getAdminToken } from '../../../../core/framework_actions/AdminSession';
import { provisionActiveVendor, type QaVendor } from '../../../../core/framework_actions/TrustActions';
import {
  adminAssign, adminCancel, dashboard, dashboardRefrescado, refreshRevenue,
  moverVencimiento, moverCancelacion, insertarCancelacionTecnica, borrarSuscripcion,
  montoFacturado, pagoDeSuscripcion, agregarSucursal, revenueBreakdown, adminRefund,
  moverPagoAlMesPasado, type Dashboard, type RevenueBreakdown,
} from '../../../../core/framework_actions/BillingActions';
import {
  vendorConTarjeta, createPromotion, getSettings, borrarPromo, isoInDays, nuevoCaption,
} from '../../../../core/framework_actions/PromotionActions';

interface IState {
  base?: Dashboard;
  baseIngresos?: RevenueBreakdown;
  vendor?: QaVendor;
  subId?: number;
  subIdsCreados?: number[];
  promoIdCreada?: number;
  adsEsperado?: number;
  lastAssign?: { status: number; ok: boolean; data: any };
}

// Higiene: las suscripciones QA (y la huella técnica) se borran al salir y la
// vista se refresca — la foto del siguiente escenario arranca limpia. El
// ledger (facturas/pagos) es inmutable por diseño y se queda.
After({ timeout: 90_000 }, async function (this: CustomWorld & IState) {
  for (const id of this.subIdsCreados ?? []) {
    try { borrarSuscripcion(id); } catch { /* best-effort */ }
  }
  if (this.promoIdCreada !== undefined) {
    try { borrarPromo(this.promoIdCreada); } catch { /* best-effort */ }
  }
  if ((this.subIdsCreados ?? []).length > 0) {
    await refreshRevenue().catch(() => undefined);
  }
});

async function asignarPro(state: CustomWorld & IState, months = 1): Promise<void> {
  const r = await adminAssign(await getAdminToken(), state.vendor!.vendorId, 'PRO', months);
  assert.ok(r.ok, `Asignar PRO falló: ${r.status} ${JSON.stringify(r.data)}`);
  state.subId = (r.data as { subscriptionId: number }).subscriptionId;
  (state.subIdsCreados ??= []).push(state.subId);
}

Given('la foto del dashboard está tomada', { timeout: 60_000 }, async function (this: CustomWorld & IState) {
  this.base = await dashboardRefrescado(await getAdminToken());
});

Given('un comercio QA sin suscripción', { timeout: 120_000 }, async function (this: CustomWorld & IState) {
  this.vendor = await provisionActiveVendor(await getAdminToken());
});

Given('un comercio QA con PRO asignado', { timeout: 120_000 }, async function (this: CustomWorld & IState) {
  this.vendor = await provisionActiveVendor(await getAdminToken());
  await asignarPro(this);
});

Given('un comercio QA con 3 sucursales activas', { timeout: 180_000 }, async function (this: CustomWorld & IState) {
  this.vendor = await provisionActiveVendor(await getAdminToken());
  await agregarSucursal(this.vendor, `${this.vendor.name} — Sucursal 2`);
  await agregarSucursal(this.vendor, `${this.vendor.name} — Sucursal 3`);
});

Given('un comercio QA con PRO vencido hace 2 meses', { timeout: 120_000 }, async function (this: CustomWorld & IState) {
  this.vendor = await provisionActiveVendor(await getAdminToken());
  await asignarPro(this);
  moverVencimiento(this.subId!, '-2 months');
});

When('el admin le asigna PRO por {int} mes', { timeout: 60_000 }, async function (this: CustomWorld & IState, months: number) {
  await asignarPro(this, months);
});

When('el admin le asigna PRO por {int} mes otra vez', { timeout: 60_000 }, async function (this: CustomWorld & IState, months: number) {
  const anterior = this.subId!;
  await asignarPro(this, months);
  assert.strictEqual(this.subId, anterior,
    `Renovar creó OTRA suscripción (${anterior} → ${this.subId}): el dashboard duplicaría al comercio.`);
});

When('el admin intenta asignarle el plan FREE', async function (this: CustomWorld & IState) {
  this.lastAssign = await adminAssign(await getAdminToken(), this.vendor!.vendorId, 'FREE', 1);
});

When('el admin cancela su suscripción', { timeout: 60_000 }, async function (this: CustomWorld & IState) {
  const r = await adminCancel(await getAdminToken(), this.vendor!.vendorId);
  assert.ok(r.ok, `Cancelar falló: ${r.status}`);
});

When('su vencimiento se mueve a dentro de {int} días y {int} horas', function (this: CustomWorld & IState, dias: number, horas: number) {
  moverVencimiento(this.subId!, `${dias} days ${horas} hours`);
});

When('su vencimiento se mueve a dentro de {int} días y {int} hora', function (this: CustomWorld & IState, dias: number, horas: number) {
  moverVencimiento(this.subId!, `${dias} days ${horas} hours`);
});

When('su vencimiento se mueve a ayer', function (this: CustomWorld & IState) {
  moverVencimiento(this.subId!, '-1 day');
});

When('la cancelación se mueve al mes pasado', function (this: CustomWorld & IState) {
  moverCancelacion(this.subId!, '-1 month');
});

When('aparece la huella de un upgrade con la tarjeta rechazada', async function (this: CustomWorld & IState) {
  this.vendor ??= await provisionActiveVendor(await getAdminToken());
  (this.subIdsCreados ??= []).push(insertarCancelacionTecnica(this.vendor.vendorId));
});

// ── Asserts de tarjetas (siempre DELTAS contra la foto) ──────────────────────

Then('el MRR sube exactamente RD${float} y Vigentes sube {int}', { timeout: 60_000 }, async function (this: CustomWorld & IState, pesos: number, delta: number) {
  const d = await dashboardRefrescado(await getAdminToken());
  assert.strictEqual(d.mrr, this.base!.mrr + pesos,
    `MRR: esperado ${this.base!.mrr + pesos}, real ${d.mrr} — la tarjeta no refleja el monto facturado.`);
  assert.strictEqual(d.activeSubscriptions, this.base!.activeSubscriptions + delta);
});

Then('el MRR sube exactamente RD${float}', { timeout: 60_000 }, async function (this: CustomWorld & IState, pesos: number) {
  const d = await dashboardRefrescado(await getAdminToken());
  assert.strictEqual(d.mrr, this.base!.mrr + pesos,
    `MRR: esperado ${this.base!.mrr + pesos}, real ${d.mrr} — la escala por sucursales no gobierna la tarjeta.`);
});

Then('el monto del MRR cruza con el pago del ledger', function (this: CustomWorld & IState) {
  const facturado = montoFacturado(this.subId!);
  const pago = pagoDeSuscripcion(this.subId!);
  assert.strictEqual(pago.status, 'Succeeded');
  assert.strictEqual(pago.amountCents, facturado,
    `El ledger cobró ${pago.amountCents} pero la suscripción quedó facturada en ${facturado}.`);
});

Then('la suscripción no aparece en "Por vencer" ni en "Vencidas"', { timeout: 60_000 }, async function (this: CustomWorld & IState) {
  const d = await dashboard(await getAdminToken());
  assert.strictEqual(d.expiringIn7Days, this.base!.expiringIn7Days, 'Una suscripción a 1 mes no puede estar "por vencer".');
  assert.strictEqual(d.pastDue, this.base!.pastDue, 'Una suscripción recién asignada no puede estar vencida.');
});

Then('es la MISMA suscripción con el vencimiento extendido', { timeout: 60_000 }, async function (this: CustomWorld & IState) {
  const d = await dashboardRefrescado(await getAdminToken());
  const row = d.subscriptions.find((s) => s.subscriptionId === this.subId);
  assert.ok(row, 'La suscripción renovada no aparece en el panel.');
  const end = new Date(row.currentPeriodEnd).getTime();
  const enUnMes = Date.now() + 32 * 86_400_000;
  assert.ok(end > enUnMes, `Renovar no extendió el período (vence ${row.currentPeriodEnd}).`);
});

Then('Vigentes subió exactamente {int} en total y el MRR exactamente RD${float}', { timeout: 60_000 }, async function (this: CustomWorld & IState, delta: number, pesos: number) {
  const d = await dashboard(await getAdminToken());
  assert.strictEqual(d.activeSubscriptions, this.base!.activeSubscriptions + delta,
    'Renovar duplicó la suscripción en Vigentes.');
  assert.strictEqual(d.mrr, this.base!.mrr + pesos, 'Renovar duplicó el monto en el MRR.');
});

Then('"Por vencer" sube {int} y sigue contando en Vigentes y en el MRR', { timeout: 60_000 }, async function (this: CustomWorld & IState, delta: number) {
  const d = await dashboardRefrescado(await getAdminToken());
  assert.strictEqual(d.expiringIn7Days, this.base!.expiringIn7Days + delta,
    'A 6 días y 23 horas del vencimiento debía contar como "por vencer".');
  assert.strictEqual(d.activeSubscriptions, this.base!.activeSubscriptions + 1,
    'Una suscripción por vencer SIGUE vigente.');
  assert.strictEqual(d.mrr, this.base!.mrr + 2000, 'Una suscripción por vencer SIGUE sumando MRR.');
});

Then('"Por vencer" vuelve al valor de la foto', { timeout: 60_000 }, async function (this: CustomWorld & IState) {
  const d = await dashboardRefrescado(await getAdminToken());
  assert.strictEqual(d.expiringIn7Days, this.base!.expiringIn7Days,
    'A 7 días y 1 hora la ventana de "por vencer" NO debía incluirla todavía.');
});

Then('"Vencidas" sube {int}, Vigentes vuelve a la foto y el MRR también', { timeout: 60_000 }, async function (this: CustomWorld & IState, delta: number) {
  const d = await dashboardRefrescado(await getAdminToken());
  assert.strictEqual(d.pastDue, this.base!.pastDue + delta, 'La vencida no entró en "Vencidas".');
  assert.strictEqual(d.activeSubscriptions, this.base!.activeSubscriptions, 'Una vencida no puede seguir en Vigentes.');
  assert.strictEqual(d.mrr, this.base!.mrr, 'Una vencida no puede seguir sumando MRR.');
});

Then('el panel la pinta {string}', { timeout: 60_000 }, async function (this: CustomWorld & IState, estado: string) {
  const d = await dashboard(await getAdminToken());
  const row = d.subscriptions.find((s) => s.subscriptionId === this.subId);
  assert.ok(row, 'La suscripción no aparece en el panel.');
  assert.strictEqual(row.status, estado);
});

Then('la suscripción vence en torno a un mes desde hoy', { timeout: 60_000 }, async function (this: CustomWorld & IState) {
  const d = await dashboardRefrescado(await getAdminToken());
  const row = d.subscriptions.find((s) => s.subscriptionId === this.subId);
  assert.ok(row, 'La suscripción renovada no aparece en el panel.');
  const dias = (new Date(row.currentPeriodEnd).getTime() - Date.now()) / 86_400_000;
  assert.ok(dias > 25 && dias < 35,
    `Renovar una vencida debía arrancar DESDE HOY (~30 días) y vence en ${dias.toFixed(1)} días — si corriera desde el vencimiento viejo seguiría vencida aun pagando.`);
});

Then('"Vencidas" vuelve a la foto y Vigentes sube {int}', { timeout: 60_000 }, async function (this: CustomWorld & IState, delta: number) {
  const d = await dashboard(await getAdminToken());
  assert.strictEqual(d.pastDue, this.base!.pastDue, 'Tras renovar, la suscripción no puede seguir vencida.');
  assert.strictEqual(d.activeSubscriptions, this.base!.activeSubscriptions + delta);
});

Then('"Bajas del mes" sube {int}, Vigentes y MRR vuelven a la foto', { timeout: 60_000 }, async function (this: CustomWorld & IState, delta: number) {
  const d = await dashboardRefrescado(await getAdminToken());
  assert.strictEqual(d.canceledThisMonth, this.base!.canceledThisMonth + delta, 'La cancelación no contó como baja.');
  assert.strictEqual(d.activeSubscriptions, this.base!.activeSubscriptions, 'Una cancelada no puede seguir en Vigentes.');
  assert.strictEqual(d.mrr, this.base!.mrr, 'Una cancelada no puede seguir sumando MRR.');
});

Then('la suscripción desaparece de la tabla del panel', { timeout: 60_000 }, async function (this: CustomWorld & IState) {
  const d = await dashboard(await getAdminToken());
  assert.ok(!d.subscriptions.some((s) => s.subscriptionId === this.subId),
    'La cancelada sigue listada en el panel (solo muestra abiertas).');
});

Then('cancelarla de nuevo se rechaza', async function (this: CustomWorld & IState) {
  const r = await adminCancel(await getAdminToken(), this.vendor!.vendorId);
  assert.ok(!r.ok, `Cancelar dos veces respondió ${r.status}.`);
});

Then('"Bajas del mes" vuelve al valor de la foto', { timeout: 60_000 }, async function (this: CustomWorld & IState) {
  const d = await dashboardRefrescado(await getAdminToken());
  assert.strictEqual(d.canceledThisMonth, this.base!.canceledThisMonth,
    'Una baja del MES PASADO no puede contar en el mes corriente.');
});

Then('"Bajas del mes" queda igual que la foto', { timeout: 60_000 }, async function (this: CustomWorld & IState) {
  const d = await dashboardRefrescado(await getAdminToken());
  assert.strictEqual(d.canceledThisMonth, this.base!.canceledThisMonth,
    'Una cancelación técnica (jamás facturada: cobro rechazado) contó como baja — churn inflado.');
});

Then('Vigentes y MRR también quedan igual', { timeout: 60_000 }, async function (this: CustomWorld & IState) {
  const d = await dashboard(await getAdminToken());
  assert.strictEqual(d.activeSubscriptions, this.base!.activeSubscriptions);
  assert.strictEqual(d.mrr, this.base!.mrr);
});

Then('la asignación se rechaza mencionando {string}', function (this: CustomWorld & IState, palabra: string) {
  const r = this.lastAssign!;
  assert.ok(!r.ok, `Asignar FREE respondió ${r.status}: crearía suscripciones de valor cero que inflan Vigentes.`);
  assert.ok(JSON.stringify(r.data).toLowerCase().includes(palabra.toLowerCase()),
    `El error no menciona "${palabra}": ${JSON.stringify(r.data)}`);
});

// ── Ingresos cobrados por fuente ─────────────────────────────────────────────

Given('la foto de los ingresos está tomada', { timeout: 60_000 }, async function (this: CustomWorld & IState) {
  this.baseIngresos = await revenueBreakdown(await getAdminToken());
});

When('un comercio QA publica una campaña pagada de {int} días', { timeout: 120_000 }, async function (this: CustomWorld & IState, dias: number) {
  const vendor = await vendorConTarjeta(await getAdminToken());
  // El monto esperado sale del precio VIGENTE de la pauta: días × precio/día.
  const settings = await getSettings(await getAdminToken());
  this.adsEsperado = (dias * settings.advertisingPricePerDayCents) / 100;

  const r = await createPromotion(vendor, {
    caption: nuevoCaption('Ingresos'), startsOn: isoInDays(0), endsOn: isoInDays(dias - 1),
  });
  assert.ok(r.ok, `Publicar la campaña falló: ${r.status} ${JSON.stringify(r.data)}`);
  this.promoIdCreada = (r.data as { promotionId: number }).promotionId;
});

Then('los ingresos por publicidad del mes suben exactamente el precio de {int} días', { timeout: 60_000 }, async function (this: CustomWorld & IState, _dias: number) {
  const d = await revenueBreakdown(await getAdminToken());
  assert.strictEqual(d.thisMonth.advertising, this.baseIngresos!.thisMonth.advertising + this.adsEsperado!,
    `Publicidad del mes: esperado +${this.adsEsperado}, real ${d.thisMonth.advertising - this.baseIngresos!.thisMonth.advertising}.`);
});

Then('el total del mes es la suma de las dos fuentes', { timeout: 60_000 }, async function (this: CustomWorld & IState) {
  const d = await revenueBreakdown(await getAdminToken());
  assert.strictEqual(d.thisMonth.total, d.thisMonth.subscriptions + d.thisMonth.advertising,
    'El total del mes no cuadra con la suma de suscripciones + publicidad.');
});

Then('los ingresos por suscripciones del mes suben exactamente RD${float}', { timeout: 60_000 }, async function (this: CustomWorld & IState, pesos: number) {
  const d = await revenueBreakdown(await getAdminToken());
  assert.strictEqual(d.thisMonth.subscriptions, this.baseIngresos!.thisMonth.subscriptions + pesos,
    `Suscripciones del mes: esperado +${pesos}, real ${d.thisMonth.subscriptions - this.baseIngresos!.thisMonth.subscriptions}.`);
});

When('el admin reembolsa ese cobro', { timeout: 60_000 }, async function (this: CustomWorld & IState) {
  const pago = pagoDeSuscripcion(this.subId!);
  const r = await adminRefund(await getAdminToken(), pago.id, 'QA: reembolso para estrés de ingresos');
  assert.ok(r.ok, `El reembolso falló: ${r.status} ${JSON.stringify(r.data)}`);
});

Then('los ingresos por suscripciones del mes vuelven a la foto', { timeout: 60_000 }, async function (this: CustomWorld & IState) {
  const d = await revenueBreakdown(await getAdminToken());
  assert.strictEqual(d.thisMonth.subscriptions, this.baseIngresos!.thisMonth.subscriptions,
    'Un cobro REEMBOLSADO sigue contando como ingreso.');
});

When('ese cobro se mueve al mes pasado', function (this: CustomWorld & IState) {
  moverPagoAlMesPasado(pagoDeSuscripcion(this.subId!).id);
});

Then('los ingresos del mes vuelven a la foto y el mes anterior sube RD${float}', { timeout: 60_000 }, async function (this: CustomWorld & IState, pesos: number) {
  const d = await revenueBreakdown(await getAdminToken());
  assert.strictEqual(d.thisMonth.subscriptions, this.baseIngresos!.thisMonth.subscriptions,
    'Un cobro del mes pasado sigue contando en el mes corriente.');
  const mesAnterior = d.months[1];
  const mesAnteriorBase = this.baseIngresos!.months[1];
  assert.strictEqual(mesAnterior.subscriptions, mesAnteriorBase.subscriptions + pesos,
    'El cobro movido no aparece en el bucket del mes anterior.');
});

Then('el histórico muestra exactamente 12 meses', { timeout: 60_000 }, async function (this: CustomWorld & IState) {
  const d = await revenueBreakdown(await getAdminToken());
  assert.strictEqual(d.months.length, 12,
    `El histórico trae ${d.months.length} filas: deben ser SIEMPRE 12 (meses sin cobros en 0).`);
});

Then('sin refresco manual, Vigentes refleja la suscripción nueva en menos de medio minuto', { timeout: 60_000 }, async function (this: CustomWorld & IState) {
  const token = await getAdminToken();
  const esperado = this.base!.activeSubscriptions + 1;
  const inicio = Date.now();
  while (Date.now() - inicio < 30_000) {
    const d = await dashboard(token); // SIN tocar el job: debe encolarse solo
    if (d.activeSubscriptions === esperado) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  assert.fail('Las tarjetas siguen viejas 30 s después de asignar: el refresco no se encola tras la acción.');
});
