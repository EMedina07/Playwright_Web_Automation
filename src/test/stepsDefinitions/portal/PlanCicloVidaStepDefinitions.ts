import { Given, When, Then, After } from '@cucumber/cucumber';
import assert from 'node:assert';
import { CustomWorld } from '../../../support/world';
import { getAdminToken } from '../../../../core/framework_actions/AdminSession';
import { provisionVendorConSucursales, type QaVendor } from '../../../../core/framework_actions/TrustActions';
import {
  activarProPorApi, adelantarReintento, adminRefund, agregarSucursal, analiticaDelComercio,
  borrarSuscripcionesDeVendor, conteoSuscripciones, contarPagosSuscripcionDeVendor,
  correrJobCobros, dashboardRefrescado, emitirFacturaAbierta, fallosDeSuscripcion,
  marcarPastDue, marcarSuspendida, moverVencimiento, pagoDeSuscripcion, refreshRevenue,
  reemplazarTramosDelPro, revenueBreakdown, suscripcionAbiertaDeVendor, tramosDelPro,
  type TierInput,
} from '../../../../core/framework_actions/BillingActions';
import { createPromotion, borrarPromo, vendorConTarjeta } from '../../../../core/framework_actions/PromotionActions';
import { PortalPlanPage } from '../../../pages/PortalPlanPage';
import { PlanesPage } from '../../../pages/PlanesPage';

interface CicloState {
  vendor?: QaVendor;
  subId?: number;
  pagoId?: number;
  tramosOriginales?: TierInput[];
  ingresosMesAntes?: number;
  mrrAntes?: number;
  promoId?: number;
}

After({ timeout: 90_000 }, async function (this: CustomWorld & CicloState) {
  // Restaurar los tramos ANTES de limpiar: la escala es estado global.
  if (this.tramosOriginales) {
    try { await reemplazarTramosDelPro(await getAdminToken(), this.tramosOriginales); } catch { /* best-effort */ }
  }
  if (this.promoId) {
    try { borrarPromo(this.promoId); } catch { /* best-effort */ }
  }
  if (this.vendor) {
    try { borrarSuscripcionesDeVendor(this.vendor.vendorId); } catch { /* best-effort */ }
    await refreshRevenue().catch(() => undefined);
  }
});

Given('un comercio QA por API con {int} sucursales y sin tarjeta', { timeout: 240_000 }, async function (this: CustomWorld & CicloState, sucursales: number) {
  this.vendor = await provisionVendorConSucursales(await getAdminToken(), sucursales);
});

// ACTIVO de verdad (publicó su primer precio): publicar publicidad exige
// comercio Activo, y el aprovisionador liviano lo deja en Registered.
Given('un comercio QA activo y publicado con tarjeta en archivo', { timeout: 240_000 }, async function (this: CustomWorld & CicloState) {
  this.vendor = await vendorConTarjeta(await getAdminToken());
});

Given('activó Pro por API pagando {int} pesos', { timeout: 90_000 }, async function (this: CustomWorld & CicloState, monto: number) {
  await activarProPorApi(this.vendor!);
  this.subId = suscripcionAbiertaDeVendor(this.vendor!.vendorId);
  const pago = pagoDeSuscripcion(this.subId);
  this.pagoId = pago.id;
  assert.strictEqual(pago.amountCents, monto * 100,
    `El primer cobro no respetó la escala: esperado RD$${monto}, cobró ${pago.amountCents / 100}.`);
});

When('agrega una sucursal más por API', { timeout: 60_000 }, async function (this: CustomWorld & CicloState) {
  await agregarSucursal(this.vendor!, `${this.vendor!.name} — Sucursal extra`);
});

When('su período vence y corre el job de cobros', { timeout: 90_000 }, async function (this: CustomWorld & CicloState) {
  moverVencimiento(this.subId!, '-1 hour');
  await correrJobCobros();
});

When('en base de datos su suscripción queda vencida con un cobro fallido', function (this: CustomWorld & CicloState) {
  marcarPastDue(this.subId!);
  // El fallo real deja una factura ABIERTA esperando el reintento — sin ella
  // el job salta la suscripción y el "PastDue" sería de utilería.
  emitirFacturaAbierta(this.subId!, this.vendor!.vendorId, 200000);
});

When('el reintento ya toca y corre el job de cobros', { timeout: 90_000 }, async function (this: CustomWorld & CicloState) {
  adelantarReintento(this.subId!);
  await correrJobCobros();
});

When('en base de datos su suscripción queda suspendida por reintentos agotados', function (this: CustomWorld & CicloState) {
  marcarSuspendida(this.subId!);
});

Then('su suscripción queda {string} en el panel de Planes', { timeout: 90_000 }, async function (this: CustomWorld & CicloState, estado: string) {
  const planes = this.getPage(PlanesPage);
  await planes.asegurarAbiertoComoAdmin(await getAdminToken());
  const visible = await planes.estadoSuscripcion(this.vendor!.name);
  assert.strictEqual(visible, estado,
    `La suscripción debía verse "${estado}" y el panel dice "${visible}".`);
});

Then('su contador de cobros fallidos queda en cero', function (this: CustomWorld & CicloState) {
  assert.strictEqual(fallosDeSuscripcion(this.subId!), 0,
    'El reintento exitoso no limpió el contador de fallos.');
});

Then('no existe el botón de usar tarjeta en archivo', { timeout: 60_000 }, async function (this: CustomWorld & CicloState) {
  assert.strictEqual(await this.getPage(PortalPlanPage).hayBotonTarjetaEnArchivo(), false,
    'Apareció "Usar tarjeta en archivo" para un comercio SIN tarjeta.');
});

Then('{string} abre el formulario para agregar tarjeta', { timeout: 60_000 }, async function (this: CustomWorld & CicloState, _boton: string) {
  await this.getPage(PortalPlanPage).cambiarAProAbreFormularioDeTarjeta();
});

When('activa Pro haciendo doble clic en usar tarjeta en archivo', { timeout: 90_000 }, async function (this: CustomWorld & CicloState) {
  await this.getPage(PortalPlanPage).activarProConDobleClic();
});

When('vuelve al plan Gratis desde el portal', { timeout: 90_000 }, async function (this: CustomWorld & CicloState) {
  await this.getPage(PortalPlanPage).volverAGratis();
});

Then('el ledger registra exactamente {int} pagos de suscripción del comercio', function (this: CustomWorld & CicloState, esperados: number) {
  const pagos = contarPagosSuscripcionDeVendor(this.vendor!.vendorId);
  assert.strictEqual(pagos, esperados,
    `Pagos en el ledger: esperados ${esperados}, hay ${pagos} — ${esperados === 1 ? 'el doble clic generó doble cobro.' : 'faltan o sobran cobros.'}`);
});

Then('el comercio tiene {int} suscripciones: {int} canceladas y {int} abiertas', function (this: CustomWorld & CicloState, total: number, canceladas: number, abiertas: number) {
  const conteo = conteoSuscripciones(this.vendor!.vendorId);
  assert.deepStrictEqual(conteo, { total, canceladas, abiertas },
    `Historial de suscripciones: esperado ${JSON.stringify({ total, canceladas, abiertas })}, hay ${JSON.stringify(conteo)}.`);
});

Given('los ingresos del mes están anotados por API', { timeout: 60_000 }, async function (this: CustomWorld & CicloState) {
  this.ingresosMesAntes = (await revenueBreakdown(await getAdminToken())).thisMonth.subscriptions;
});

Given('el MRR está anotado por API', { timeout: 60_000 }, async function (this: CustomWorld & CicloState) {
  this.mrrAntes = (await dashboardRefrescado(await getAdminToken())).mrr;
});

Then('el MRR subió exactamente {int} pesos: la baja no suma y la nueva sí', { timeout: 60_000 }, async function (this: CustomWorld & CicloState, pesos: number) {
  const mrr = (await dashboardRefrescado(await getAdminToken())).mrr;
  assert.strictEqual(mrr, this.mrrAntes! + pesos,
    `MRR tras cancelar y re-suscribir: esperado RD$${this.mrrAntes! + pesos} (una sola suscripción viva), hay RD$${mrr}.`);
});

Then('los ingresos del mes por suscripciones bajan {int} pesos', { timeout: 60_000 }, async function (this: CustomWorld & CicloState, pesos: number) {
  const despues = (await revenueBreakdown(await getAdminToken())).thisMonth.subscriptions;
  assert.strictEqual(despues, this.ingresosMesAntes! - pesos,
    `El reembolso no restó de los ingresos del mes: antes RD$${this.ingresosMesAntes}, después RD$${despues} (debía bajar RD$${pesos}).`);
});

When('el admin reembolsa ese pago por API', { timeout: 60_000 }, async function (this: CustomWorld & CicloState) {
  const r = await adminRefund(await getAdminToken(), this.pagoId!, 'QA: reembolso de prueba');
  assert.ok(r.ok, `El reembolso falló: ${r.status} ${JSON.stringify(r.data)}`);
});

Then('en el journal del back-office queda el hecho {string} del comercio', { timeout: 90_000 }, async function (this: CustomWorld & CicloState, tipo: string) {
  const planes = this.getPage(PlanesPage);
  await planes.asegurarAbiertoComoAdmin(await getAdminToken());
  const journal = await planes.journalDelComercio(this.vendor!.vendorId, tipo);
  assert.ok(journal.snapshot.length > 0, `El hecho ${tipo} no trae snapshot en el detalle.`);
});

Then('puede publicar una promoción pagada', { timeout: 60_000 }, async function (this: CustomWorld & CicloState) {
  const r = await createPromotion(this.vendor!, { caption: 'QA: promo antes de la suspensión' });
  assert.ok(r.ok, `Activo y al día, publicar publicidad debía funcionar: ${r.status} ${JSON.stringify(r.data)}`);
  this.promoId = (r.data as { promotionId: number }).promotionId;
});

Then('publicar otra promoción se rechaza por la deuda pendiente', { timeout: 60_000 }, async function (this: CustomWorld & CicloState) {
  const r = await createPromotion(this.vendor!, { caption: 'QA: promo con deuda' });
  assert.ok(!r.ok, `Suspendido por cobros fallidos y la publicidad respondió ${r.status}: la deuda no bloquea.`);
  assert.ok(JSON.stringify(r.data).includes('suspendida'),
    'El rechazo no explica que la suscripción está suspendida por cobros pendientes.');
});

Then('su analítica Pro responde por API', { timeout: 60_000 }, async function (this: CustomWorld & CicloState) {
  const r = await analiticaDelComercio(this.vendor!);
  assert.ok(r.ok, `La analítica Pro debía responder y devolvió ${r.status}.`);
});

Then('su analítica Pro es rechazada por API con el aviso de plan', { timeout: 60_000 }, async function (this: CustomWorld & CicloState) {
  const r = await analiticaDelComercio(this.vendor!);
  assert.ok(!r.ok, `Suspendido y la analítica Pro respondió ${r.status}: la suspensión no bloquea.`);
  assert.ok(JSON.stringify(r.data).includes('plan Pro'),
    'El rechazo no trae el aviso claro de que necesita el plan Pro.');
});

Given('los tramos del plan Pro están anotados para restaurarlos', { timeout: 60_000 }, async function (this: CustomWorld & CicloState) {
  this.tramosOriginales = await tramosDelPro(await getAdminToken());
});

Given('el tramo de 21 o más sucursales queda en modo Negociado', { timeout: 60_000 }, async function (this: CustomWorld & CicloState) {
  const tramos = this.tramosOriginales!.map((t) =>
    t.minBranches >= 21 ? { ...t, mode: 'Negotiated', amountCents: 0 } : t);
  await reemplazarTramosDelPro(await getAdminToken(), tramos);
});

Then('el portal avisa que su precio es negociado y no deja activar Pro', { timeout: 60_000 }, async function (this: CustomWorld & CicloState) {
  assert.ok(await this.getPage(PortalPlanPage).avisaPrecioNegociadoYNoDejaActivar(),
    'El tramo negociado sin precio pactado dejó el botón de activar habilitado.');
});
