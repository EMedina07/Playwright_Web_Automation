// Acciones reutilizables para la pantalla de CONFIANZA de comercios.
// E2E sobre la API real (+ SQL para precondiciones, como VendorSetup): provisiona
// comercios y consumidores, publica precios (Canal A firmado con HMAC), genera
// reportes de caja y modera comercios. Lo consumen los steps de UI y de API.

import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { generateTotp } from './TotpGenerator';
import { waitForEmailCode } from './DevMailReader';

const API = process.env.API_URL ?? 'http://localhost:5265';
const DB_CONTAINER = process.env.DB_CONTAINER ?? 'pricelist-db';
const DB_USER = process.env.PGUSER ?? 'pricelist';
const DB_NAME = process.env.PGDATABASE ?? 'pricelist_dev';

// ── HTTP crudo (para poder inspeccionar status en casos negativos) ───────────

export interface Raw { status: number; ok: boolean; data: any; title?: string }

export async function raw(path: string, opts: { method?: string; token?: string; body?: unknown } = {}): Promise<Raw> {
  const res = await fetch(API + path, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { status: res.status, ok: res.ok, data, title: data?.title };
}

async function post(path: string, body: unknown, token?: string) {
  const r = await raw(path, { method: 'POST', body, token });
  if (!r.ok) throw new Error(`POST ${path} -> ${r.status}: ${r.title ?? JSON.stringify(r.data)}`);
  return r.data;
}

function sqlScalar(statement: string): string {
  return execFileSync('docker', ['exec', DB_CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-t', '-A', '-c', statement],
    { encoding: 'utf8' }).trim();
}

// ── Canal A: ingesta firmada (byte a byte igual al HmacSignatureFilter) ──────

function signedHeaders(rawApiKey: string, body: string): Record<string, string> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID();
  const hmacKey = crypto.createHash('sha256').update(rawApiKey, 'utf8').digest(); // 32 bytes crudos
  const signature = crypto.createHmac('sha256', hmacKey).update(`${ts}.${nonce}.${body}`, 'utf8').digest('hex');
  return { 'X-Api-Key': rawApiKey, 'X-Timestamp': ts, 'X-Nonce': nonce, 'X-Signature': signature, 'Content-Type': 'application/json' };
}

export interface BatchResult { status: string; totalLines: number; inserted: number; sentToReview: number; quarantined: number; autoCreatedProducts: number }

export async function postSignedBatch(vendorId: number, apiKey: string, payload: unknown): Promise<BatchResult> {
  const body = JSON.stringify(payload);
  const res = await fetch(`${API}/api/vendors/${vendorId}/prices`, { method: 'POST', headers: signedHeaders(apiKey, body), body });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`Canal A -> ${res.status}: ${data?.title ?? text}`);
  return data as BatchResult;
}

// Precio típico de mercado de un producto (para no disparar el control de
// desviación al publicar). 95 si nadie lo vende aún.
export function typicalPrice(canonicalProductId: number): number {
  const v = sqlScalar(
    `SELECT coalesce(round(avg(pr.amount/pr.quantity))::int, 95) FROM current_prices cur JOIN prices pr ON pr.id=cur.price_id WHERE cur.canonical_product_id=${canonicalProductId}`);
  return Number(v) || 95;
}

// ── Comercio provisionado ────────────────────────────────────────────────────

export interface QaVendor {
  vendorId: number;
  name: string;
  email: string;
  password: string;
  totpSecret: string;
  apiKey: string;
  productId: number;
}

let seq = 0;
// Único incluso bajo ejecución paralela (evita colisiones de email/teléfono/RNC
// que el registro rechaza con 500 por índice único).
const uniq = () => `${Date.now()}${seq++}${crypto.randomInt(100, 999)}`;
const rndDigits = (n: number) => Array.from({ length: n }, () => crypto.randomInt(0, 10)).join('');

// Login del comercio que ENROLA MFA en el primer intento y captura el secreto
// TOTP (necesario para intentos de login posteriores en los casos de portal).
async function vendorEnrollAndSecret(email: string, password: string): Promise<{ secret: string; token: string }> {
  const first = await raw('/api/vendors/login', { method: 'POST', body: { email, password } });
  const secret: string | undefined = first.data?.mfaSetup?.secret;
  if (!secret) throw new Error('El primer login no devolvió el secreto MFA para enrolar.');
  const code = generateTotp(secret);
  const second = await raw('/api/vendors/login', { method: 'POST', body: { email, password, totpCode: code } });
  if (!second.data?.accessToken) throw new Error(`Login con TOTP no emitió token: ${second.title}`);
  return { secret, token: second.data.accessToken };
}

// Registra → verifica correo (código del log dev) → aprueba (admin API) →
// enrola MFA → crea sucursal → API key → publica el precio típico del producto.
export async function provisionActiveVendor(adminToken: string, productId = 121): Promise<QaVendor> {
  const uid = uniq();
  const email = `qa.${uid}@comercios.pricelist.dev`;
  const password = 'Comercio#QA2026';
  const reg = await post('/api/vendors/register', {
    name: `QA Comercio ${uid}`, legalName: `QA Comercio ${uid}, SRL`, email,
    phone: `+1809${rndDigits(7)}`, address: 'Av. QA 100, Santo Domingo',
    taxId: `${crypto.randomInt(1, 9)}${rndDigits(8)}`, password,
  });
  const vendorId = reg.vendorId as number;

  const code = await waitForEmailCode(email);
  if (!code) throw new Error(`No apareció código de verificación para ${email}.`);
  await post('/api/vendors/verify-email', { email, code });
  await post(`/api/admin/vendors/${vendorId}/applications/approve`, {}, adminToken);

  const { secret, token } = await vendorEnrollAndSecret(email, password);
  await post(`/api/vendors/${vendorId}/branches`, { name: `QA Comercio ${uid} — Sucursal 1`, address: 'Av. QA 100, Santo Domingo', latitude: 18.4861, longitude: -69.9312 }, token);
  const keyResp = await post(`/api/vendors/${vendorId}/api-key`, {}, token);
  const apiKey = keyResp.apiKey as string;

  await postSignedBatch(vendorId, apiKey, {
    batchId: crypto.randomUUID(), branchId: null,
    lines: [{ sku: '7460001001247', price: typicalPrice(productId), name: 'Leche UHT Laval entera 1 L', gtin: '7460001001247', itbisRate: 0.18, unit: 'unidad', quantity: 1 }],
  });
  return { vendorId, name: `QA Comercio ${uid}`, email, password, totpSecret: secret, apiKey, productId };
}

// Comercio QA para los escenarios de facturación por escala (EP-16): N
// sucursales EXACTAS (0 = sin sucursal; el motor cobra como 1) y nada más —
// sin API key ni precios, que aquí no juegan. El registro, la verificación de
// correo, la aprobación y el enrolamiento MFA son los flujos reales.
export async function provisionVendorConSucursales(adminToken: string, sucursales: number): Promise<QaVendor> {
  const uid = uniq();
  const email = `qa.${uid}@comercios.pricelist.dev`;
  const password = 'Comercio#QA2026';
  const reg = await post('/api/vendors/register', {
    name: `QA Escala ${sucursales}s ${uid}`, legalName: `QA Escala ${uid}, SRL`, email,
    phone: `+1809${rndDigits(7)}`, address: 'Av. QA 100, Santo Domingo',
    taxId: `${crypto.randomInt(1, 9)}${rndDigits(8)}`, password,
  });
  const vendorId = reg.vendorId as number;

  const code = await waitForEmailCode(email);
  if (!code) throw new Error(`No apareció código de verificación para ${email}.`);
  await post('/api/vendors/verify-email', { email, code });
  await post(`/api/admin/vendors/${vendorId}/applications/approve`, {}, adminToken);

  const { secret, token } = await vendorEnrollAndSecret(email, password);
  for (let i = 1; i <= sucursales; i++) {
    await post(`/api/vendors/${vendorId}/branches`, {
      name: `QA Escala ${uid} — Sucursal ${i}`, address: `Calle QA ${i}, Santo Domingo`,
      latitude: 18.45 + i * 0.005, longitude: -69.99 + i * 0.005,
    }, token);
  }
  return { vendorId, name: `QA Escala ${sucursales}s ${uid}`, email, password, totpSecret: secret, apiKey: '', productId: 0 };
}

export async function publishProducts(v: QaVendor, pairs: [number, string][]): Promise<BatchResult> {
  const lines = pairs.map(([id, gtin]) => ({ sku: gtin, price: typicalPrice(id), gtin, name: `p${id}`, itbisRate: 0.18, unit: 'unidad', quantity: 1 }));
  return postSignedBatch(v.vendorId, v.apiKey, { batchId: crypto.randomUUID(), branchId: null, lines });
}

// ── Consumidores y reportes ──────────────────────────────────────────────────

export interface QaConsumer { token: string; phone: string }

export async function registerConsumer(phone?: string): Promise<QaConsumer> {
  const ph = phone ?? `+1829${String(uniq()).slice(-7)}`;
  const req = await post('/api/auth/otp/request', { phone: ph });
  const verify = await post('/api/auth/otp/verify', { phone: ph, code: req.devCode, acceptedTerms: true });
  return { token: verify.accessToken, phone: ph };
}

export async function deleteConsumer(token: string): Promise<void> {
  await raw('/api/consumers/me', { method: 'DELETE', token });
}

// NB reglas de confianza vigentes:
//  · Un "no coincidió" solo CUENTA si el precio pagado SUPERA el publicado —
//    por eso el default es alto (el comercio QA publica al precio típico).
//  · La suspensión exige ≥3 DISPOSITIVOS distintos: cada reporte lleva deviceId
//    (default: uno por consumidor/token, simulando el celular de cada persona).
export const HIGH_SEEN_PRICE = 900_000;

export async function report(token: string, vendorId: number, productId: number, opts: { matched?: boolean; seenPrice?: number; comment?: string; deviceId?: string } = {}): Promise<{ registered: boolean; vendorSuspended: boolean }> {
  const deviceId = opts.deviceId ?? `qa-device-${token.slice(-24)}`;
  return post('/api/reports/price-check', { vendorId, productId, matched: opts.matched ?? false, seenPrice: opts.seenPrice ?? HIGH_SEEN_PRICE, comment: opts.comment, deviceId }, token);
}

// Genera `n` reportes de "no coincidió" de `n` consumidores distintos (cada uno
// desde su propio dispositivo) sobre el producto del comercio. Devuelve si
// quedó suspendido al último.
export async function reportFromDistinctConsumers(v: QaVendor, n: number, startPrice = HIGH_SEEN_PRICE - 100): Promise<boolean> {
  let suspended = false;
  for (let i = 0; i < n; i++) {
    const c = await registerConsumer();
    const r = await report(c.token, v.vendorId, v.productId, { seenPrice: startPrice + i, deviceId: `qa-device-${c.phone}` });
    suspended = r.vendorSuspended;
  }
  return suspended;
}

/// Higiene: borra los reportes de caja del comercio QA. Sin esto, cada corrida
/// acumula comercios con 3+ reportes que empujan a los nuevos fuera de la
/// primera página del panel de Confianza (ordena por cantidad de reportes) —
/// y la suite se pone roja por contaminación, no por un defecto.
export function borrarReportesDeVendor(vendorId: number): void {
  sqlScalar(`DELETE FROM price_reports WHERE vendor_id = ${Math.trunc(vendorId)}`);
}

// ── Moderación y consulta (admin) ────────────────────────────────────────────

export async function moderate(adminToken: string, vendorId: number, action: 'activate' | 'suspend', reason?: string): Promise<Raw> {
  return raw(`/api/admin/vendors/${vendorId}/moderate`, { method: 'POST', token: adminToken, body: { action, reason } });
}

export async function complaintDetail(adminToken: string, vendorId: number): Promise<any | null> {
  const r = await raw(`/api/admin/vendors/${vendorId}/complaints`, { token: adminToken });
  return r.ok ? r.data : null;
}

export async function vendorStatus(adminToken: string, vendorId: number): Promise<string | null> {
  return (await complaintDetail(adminToken, vendorId))?.status ?? null;
}

export async function tryVendorLogin(v: QaVendor): Promise<{ status: number; ok: boolean; hasToken: boolean; title?: string }> {
  const code = generateTotp(v.totpSecret);
  const r = await raw('/api/vendors/login', { method: 'POST', body: { email: v.email, password: v.password, totpCode: code } });
  return { status: r.status, ok: r.ok, hasToken: !!r.data?.accessToken, title: r.title };
}

// ¿La app puede mostrar/recomendar ESTE comercio? "Explorar comercio" devuelve
// datos solo si está Activo (señal directa, no depende de ser el más barato).
export async function appCanShowVendor(vendorId: number, productId: number): Promise<boolean> {
  const r = await raw(`/api/comparison/vendors/${vendorId}`, { method: 'POST', body: { items: [{ productId, quantity: 1 }], latitude: 18.4861, longitude: -69.9312 } });
  return r.ok && JSON.stringify(r.data).includes(`"vendorId":${vendorId}`);
}
