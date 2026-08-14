import { execFileSync } from 'node:child_process';
import { raw, type QaVendor, type Raw } from './TrustActions';
import { vendorJwt } from './PromotionActions';

// Acciones del dashboard de ingresos (A-02): asignación/cancelación de planes,
// lectura de tarjetas, refresco de la vista materializada bajo demanda y
// VIAJES EN EL TIEMPO por SQL — vencimientos y bajas viven en fechas y ninguna
// suite puede esperar un mes de verdad.

const DB = ['exec', process.env.DB_CONTAINER ?? 'pricelist-db',
  'psql', '-U', process.env.DB_USER ?? 'pricelist', '-d', process.env.DB_NAME ?? 'pricelist_dev', '-t', '-A', '-c'];

function sql(statement: string): string {
  return execFileSync('docker', [...DB, statement], { encoding: 'utf8' }).trim().split('\n')[0]?.trim() ?? '';
}

export interface Dashboard {
  mrr: number; activeSubscriptions: number; expiringIn7Days: number;
  pastDue: number; canceledThisMonth: number;
  subscriptions: { subscriptionId: number; vendorId: number; status: string; currentPeriodEnd: string }[];
}

export const adminAssign = (token: string, vendorId: number, planCode: string, months: number, note?: string): Promise<Raw> =>
  raw(`/api/admin/billing/vendors/${vendorId}/subscription`, {
    method: 'POST', token, body: { planCode, months, note: note ?? null },
  });

export const adminCancel = (token: string, vendorId: number): Promise<Raw> =>
  raw(`/api/admin/billing/vendors/${vendorId}/subscription`, { method: 'DELETE', token });

export async function dashboard(token: string): Promise<Dashboard> {
  const r = await raw('/api/admin/billing/dashboard', { token });
  if (!r.ok) throw new Error(`dashboard -> ${r.status}`);
  return r.data as Dashboard;
}

/// Fuerza el refresco de mv_revenue_totals YA (el cron real corre cada 10 min).
export async function refreshRevenue(): Promise<void> {
  const r = await raw('/api/dev/jobs/refresh-revenue-totals/run', { method: 'POST' });
  if (!r.ok) throw new Error(`refresh-revenue-totals -> ${r.status}`);
}

export async function dashboardRefrescado(token: string): Promise<Dashboard> {
  await refreshRevenue();
  return dashboard(token);
}

// ── Viajes en el tiempo (SQL): la única forma honesta de estresar fechas ─────

export function moverVencimiento(subscriptionId: number, intervalo: string): void {
  sql(`UPDATE subscriptions SET current_period_end = now() + interval '${intervalo}' WHERE id = ${Math.trunc(subscriptionId)}`);
}

export function moverCancelacion(subscriptionId: number, intervalo: string): void {
  sql(`UPDATE subscriptions SET canceled_at = now() + interval '${intervalo}' WHERE id = ${Math.trunc(subscriptionId)}`);
}

/// Inserta la huella de una cancelación TÉCNICA: suscripción cancelada al
/// instante SIN haberse facturado jamás (current_amount_cents NULL) — lo que
/// deja un intento de upgrade con la tarjeta rechazada. No debe contar como
/// baja del mes.
export function insertarCancelacionTecnica(vendorId: number): number {
  const id = sql(`
    INSERT INTO subscriptions (vendor_id, plan_id, started_at, current_period_end, canceled_at, note)
    SELECT ${Math.trunc(vendorId)}, p.id, now(), now(), now(), 'QA: cancelación técnica (cobro rechazado)'
    FROM plans p WHERE p.code = 'PRO'
    RETURNING id`);
  return Number(id);
}

export function borrarSuscripcion(subscriptionId: number): void {
  const id = Math.trunc(subscriptionId);
  // También su rastro en el ledger: el ledger real es inmutable por diseño,
  // pero los cobros QA no son ingresos — dejarlos infló "Suscripciones este
  // mes" a RD$228,600 fantasma (hallazgo del dueño). El journal (bitácora) se
  // queda: no suma en ningún total.
  sql(`DELETE FROM payments WHERE related_entity_type = 'subscription' AND related_entity_id = ${id}`);
  sql(`DELETE FROM invoices WHERE related_entity_type = 'subscription' AND related_entity_id = ${id}`);
  sql(`DELETE FROM subscriptions WHERE id = ${id}`);
}

/// Higiene para flujos por UI (donde no hay subscriptionId a mano): borra
/// TODAS las suscripciones del comercio QA con su rastro en el ledger.
export function borrarSuscripcionesDeVendor(vendorId: number): void {
  const id = Math.trunc(vendorId);
  sql(`DELETE FROM payments WHERE related_entity_type = 'subscription'
       AND related_entity_id IN (SELECT id FROM subscriptions WHERE vendor_id = ${id})`);
  sql(`DELETE FROM invoices WHERE related_entity_type = 'subscription'
       AND related_entity_id IN (SELECT id FROM subscriptions WHERE vendor_id = ${id})`);
  sql(`DELETE FROM subscriptions WHERE vendor_id = ${id}`);
}

/// El monto MENSUAL facturado que quedó en la suscripción (la vara del MRR).
export function montoFacturado(subscriptionId: number): number {
  return Number(sql(`SELECT current_amount_cents FROM subscriptions WHERE id = ${Math.trunc(subscriptionId)}`));
}

/// El último pago del ledger ligado a la suscripción (cruce contable).
export function pagoDeSuscripcion(subscriptionId: number): { id: number; amountCents: number; status: string } {
  const out = sql(`
    SELECT id || '|' || amount_cents || '|' || status FROM payments
    WHERE related_entity_type = 'subscription' AND related_entity_id = ${Math.trunc(subscriptionId)}
    ORDER BY id DESC LIMIT 1`);
  if (!out) throw new Error(`No hay pagos en el ledger para la suscripción ${subscriptionId}.`);
  const [id, amountCents, status] = out.split('|');
  return { id: Number(id), amountCents: Number(amountCents), status };
}

// ── Estados de suscripción (escenarios de panel) ─────────────────────────────

/// Activa Pro como lo haría el portal con tarjeta en archivo (mismo endpoint).
export async function activarProPorApi(v: QaVendor): Promise<void> {
  const jwt = await vendorJwt(v);
  const r = await raw(`/api/vendors/${v.vendorId}/plan`, {
    method: 'POST', token: jwt, body: { planCode: 'PRO' },
  });
  if (!r.ok) throw new Error(`Activar Pro falló: ${r.status} ${JSON.stringify(r.data)}`);
}

export function suscripcionAbiertaDeVendor(vendorId: number): number {
  const id = sql(`SELECT id FROM subscriptions WHERE vendor_id = ${Math.trunc(vendorId)}
    AND canceled_at IS NULL ORDER BY id DESC LIMIT 1`);
  if (!id) throw new Error(`El comercio ${vendorId} no tiene suscripción abierta.`);
  return Number(id);
}

/// PastDue: venció con un cobro fallido, dentro de la ventana de reintentos.
export function marcarPastDue(subscriptionId: number): void {
  sql(`UPDATE subscriptions SET current_period_end = now() - interval '3 days',
    failed_payment_attempts = 1, last_billing_attempt_at = now() - interval '1 day',
    suspended_at = NULL WHERE id = ${Math.trunc(subscriptionId)}`);
}

/// Suspended: se agotaron los tres reintentos y quedó suspendida.
export function marcarSuspendida(subscriptionId: number): void {
  sql(`UPDATE subscriptions SET current_period_end = now() - interval '10 days',
    failed_payment_attempts = 3, last_billing_attempt_at = now() - interval '1 day',
    suspended_at = now() - interval '1 day' WHERE id = ${Math.trunc(subscriptionId)}`);
}

/// Canceled: baja explícita (el rastro se queda, el panel la lista al final).
export function marcarCancelada(subscriptionId: number): void {
  sql(`UPDATE subscriptions SET canceled_at = now() WHERE id = ${Math.trunc(subscriptionId)}`);
}

/// La baja del comercio (lo que dispara el botón "Volver al plan Gratis").
export async function bajaAGratisPorApi(v: QaVendor): Promise<Raw> {
  const jwt = await vendorJwt(v);
  return raw(`/api/vendors/${v.vendorId}/plan`, {
    method: 'POST', token: jwt, body: { planCode: 'FREE' },
  });
}

/// Corre YA el job de cobros (renovaciones + reintentos + suspensiones).
export async function correrJobCobros(): Promise<void> {
  const r = await raw('/api/dev/jobs/subscription-billing/run', { method: 'POST' });
  if (!r.ok) throw new Error(`subscription-billing -> ${r.status}`);
}

/// Adelanta el reloj del reintento: el job solo reintenta cuando pasó el
/// intervalo configurado desde el último intento. 40 días atrás supera
/// cualquier configuración posible (el máximo del admin es 30).
export function adelantarReintento(subscriptionId: number): void {
  sql(`UPDATE subscriptions SET last_billing_attempt_at = now() - interval '40 days'
    WHERE id = ${Math.trunc(subscriptionId)}`);
}

/// La huella de un cobro fallido HONESTA: el job solo reintenta si hay una
/// factura ABIERTA ligada a la suscripción (sin ella, salta la fila).
export function emitirFacturaAbierta(subscriptionId: number, vendorId: number, amountCents: number): void {
  sql(`INSERT INTO invoices (vendor_id, purpose, amount_cents, currency, status, period_start, period_end,
      description, related_entity_type, related_entity_id, issued_at, updated_at)
    VALUES (${Math.trunc(vendorId)}, 'Subscription', ${Math.trunc(amountCents)}, 'DOP', 'Open',
      now() - interval '3 days', now() + interval '27 days',
      'QA: factura pendiente de reintento', 'subscription', ${Math.trunc(subscriptionId)}, now() - interval '3 days', now())`);
}

/// Infla el monto mensual facturado de la suscripción (la vara del MRR) —
/// para estresar las tarjetas del dashboard con montos gigantes.
export function inflarMontoSuscripcion(subscriptionId: number, amountCents: number): void {
  sql(`UPDATE subscriptions SET current_amount_cents = ${Math.trunc(amountCents)}
    WHERE id = ${Math.trunc(subscriptionId)}`);
}

export function fallosDeSuscripcion(subscriptionId: number): number {
  return Number(sql(`SELECT failed_payment_attempts FROM subscriptions WHERE id = ${Math.trunc(subscriptionId)}`));
}

export function contarPagosSuscripcionDeVendor(vendorId: number): number {
  return Number(sql(`SELECT count(*) FROM payments p JOIN subscriptions s
    ON s.id = p.related_entity_id AND p.related_entity_type = 'subscription'
    WHERE s.vendor_id = ${Math.trunc(vendorId)}`));
}

export function conteoSuscripciones(vendorId: number): { total: number; canceladas: number; abiertas: number } {
  const out = sql(`SELECT count(*) || '|' || count(*) FILTER (WHERE canceled_at IS NOT NULL)
    || '|' || count(*) FILTER (WHERE canceled_at IS NULL)
    FROM subscriptions WHERE vendor_id = ${Math.trunc(vendorId)}`);
  const [total, canceladas, abiertas] = out.split('|').map(Number);
  return { total, canceladas, abiertas };
}

/// Analítica Pro del comercio (endpoint con gate de plan): la sonda para
/// probar que la suspensión bloquea las funciones Pro DE VERDAD.
export async function analiticaDelComercio(v: QaVendor): Promise<Raw> {
  const jwt = await vendorJwt(v);
  return raw(`/api/vendors/${v.vendorId}/insights/analytics`, { token: jwt });
}

// ── Tramos del plan (EP-16) — para el caso del tramo Negociado ───────────────

export interface TierInput { minBranches: number; maxBranches: number | null; mode: string; amountCents: number }

export async function tramosDelPro(adminToken: string): Promise<TierInput[]> {
  const r = await raw('/api/admin/billing/plan-pricing', { token: adminToken });
  if (!r.ok) throw new Error(`plan-pricing -> ${r.status}`);
  const pro = (r.data as { code: string; tiers: { minBranches: number; maxBranches: number | null; mode: string; amount: number }[] }[])
    .find((p) => p.code === 'PRO');
  if (!pro) throw new Error('No hay plan PRO en plan-pricing.');
  return pro.tiers.map((t) => ({
    minBranches: t.minBranches, maxBranches: t.maxBranches, mode: t.mode,
    amountCents: Math.round(t.amount * 100),
  }));
}

export async function reemplazarTramosDelPro(adminToken: string, tiers: TierInput[]): Promise<void> {
  const r = await raw('/api/admin/billing/plans/PRO/tiers', { method: 'PUT', token: adminToken, body: tiers });
  if (!r.ok) throw new Error(`replace tiers -> ${r.status}: ${JSON.stringify(r.data)}`);
}

// ── Ingresos cobrados por fuente (desglose del dashboard) ────────────────────

export interface RevenueSlice { subscriptions: number; advertising: number; total: number }
export interface RevenueBreakdown {
  thisMonth: RevenueSlice; allTime: RevenueSlice;
  months: { month: string; subscriptions: number; advertising: number; total: number }[];
}

export async function revenueBreakdown(token: string): Promise<RevenueBreakdown> {
  const r = await raw('/api/admin/billing/revenue-breakdown', { token });
  if (!r.ok) throw new Error(`revenue-breakdown -> ${r.status}`);
  return r.data as RevenueBreakdown;
}

export const adminRefund = (token: string, paymentId: number, reason: string): Promise<Raw> =>
  raw(`/api/admin/billing/payments/${paymentId}/refund`, { method: 'POST', token, body: { reason } });

/// Mueve un cobro al mes pasado (SQL): estresa el corte mensual del histórico
/// sin esperar un mes de verdad.
export function moverPagoAlMesPasado(paymentId: number): void {
  sql(`UPDATE payments SET created_at = now() - interval '1 month' WHERE id = ${Math.trunc(paymentId)}`);
}

/// Sucursal extra para el comercio QA (activa la escala por sucursales).
export async function agregarSucursal(v: QaVendor, nombre: string): Promise<void> {
  const jwt = await vendorJwt(v);
  const r = await raw(`/api/vendors/${v.vendorId}/branches`, {
    method: 'POST', token: jwt,
    body: { name: nombre, address: 'Av. QA 200, Santo Domingo', latitude: 18.49, longitude: -69.94 },
  });
  if (!r.ok) throw new Error(`Alta de sucursal falló: ${r.status} ${JSON.stringify(r.data)}`);
}
