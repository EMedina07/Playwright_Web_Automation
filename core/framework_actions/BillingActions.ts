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
  sql(`DELETE FROM subscriptions WHERE id = ${Math.trunc(subscriptionId)}`);
}

/// El monto MENSUAL facturado que quedó en la suscripción (la vara del MRR).
export function montoFacturado(subscriptionId: number): number {
  return Number(sql(`SELECT current_amount_cents FROM subscriptions WHERE id = ${Math.trunc(subscriptionId)}`));
}

/// El último pago del ledger ligado a la suscripción (cruce contable).
export function pagoDeSuscripcion(subscriptionId: number): { amountCents: number; status: string } {
  const out = sql(`
    SELECT amount_cents || '|' || status FROM payments
    WHERE related_entity_type = 'subscription' AND related_entity_id = ${Math.trunc(subscriptionId)}
    ORDER BY id DESC LIMIT 1`);
  if (!out) throw new Error(`No hay pagos en el ledger para la suscripción ${subscriptionId}.`);
  const [amountCents, status] = out.split('|');
  return { amountCents: Number(amountCents), status };
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
