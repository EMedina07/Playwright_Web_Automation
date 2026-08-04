import crypto from 'node:crypto';
import { raw, type QaVendor, type Raw } from './TrustActions';
import { generateTotp } from './TotpGenerator';

// Acciones del módulo de promociones (B-02): publicar con imagen (multipart),
// cotizar, desactivar/reactivar, moderación y configuración del carrusel.

const API = process.env.API_URL ?? 'http://localhost:5265';

export interface PromotionRow {
  id: number; vendorId: number; caption: string; isActive: boolean;
  startsOn: string; endsOn: string; deactivatedBy: string | null;
}

export interface PromoSettings { intervalSeconds: number; advertisingPricePerDayCents: number }

/// JWT del comercio (login + TOTP). Cacheado por email: el anti-replay del
/// TOTP no permite repetir el mismo paso de 30 s.
const jwtCache = new Map<string, string>();
export async function vendorJwt(v: QaVendor): Promise<string> {
  const cached = jwtCache.get(v.email);
  if (cached) return cached;
  const r = await raw('/api/vendors/login', {
    method: 'POST',
    body: { email: v.email, password: v.password, totpCode: generateTotp(v.totpSecret) },
  });
  const token = (r.data as { accessToken?: string })?.accessToken;
  if (!token) throw new Error(`Login del comercio falló (${r.status}): ${JSON.stringify(r.data).slice(0, 120)}`);
  jwtCache.set(v.email, token);
  return token;
}

/// Tarjeta en archivo (la pasarela dev tokeniza y aprueba siempre).
export async function addCard(v: QaVendor): Promise<void> {
  const jwt = await vendorJwt(v);
  const r = await raw(`/api/vendors/${v.vendorId}/payment-methods`, {
    method: 'POST', token: jwt,
    body: { cardHolderName: 'QA Promociones', brand: 'VISA', last4: '4242', expMonth: 12, expYear: 2031, makeDefault: true },
  });
  if (!r.ok) throw new Error(`Alta de tarjeta falló: ${r.status} ${JSON.stringify(r.data)}`);
}

/// PNG real de 1×1 (válido para el sniffing del almacén de imágenes).
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

export interface CreatePromoInput {
  caption?: string;
  startsOn?: string;              // ISO yyyy-mm-dd
  endsOn?: string;
  branchIds?: number[];
  image?: Buffer | null;          // null = sin imagen
  contentType?: string;
}

const isoToday = () => new Date().toISOString().slice(0, 10);
export function isoInDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/// Publica una promoción (multipart, como el portal). Devuelve el Raw crudo:
/// los negativos necesitan status y mensaje.
export async function createPromotion(v: QaVendor, input: CreatePromoInput = {}): Promise<Raw> {
  const jwt = await vendorJwt(v);
  const form = new FormData();
  if (input.image !== null) {
    const bytes = input.image ?? PNG_1X1;
    form.append('Image', new Blob([new Uint8Array(bytes)], { type: input.contentType ?? 'image/png' }), 'promo.png');
  }
  form.append('Caption', input.caption ?? `Promo QA ${Date.now()}`);
  form.append('StartsOn', input.startsOn ?? isoToday());
  form.append('EndsOn', input.endsOn ?? isoToday());
  for (const id of input.branchIds ?? []) form.append('BranchIds', String(id));

  try {
    const res = await fetch(`${API}/api/vendors/${v.vendorId}/promotions`, {
      method: 'POST', headers: { Authorization: `Bearer ${jwt}` }, body: form,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    return { status: res.status, ok: res.ok, data, title: data?.title };
  } catch {
    // Con un cuerpo que excede RequestSizeLimit, Kestrel corta la conexión
    // ANTES de responder y undici lanza "fetch failed". Es un rechazo del
    // servidor con todas las letras — se reporta como tal, no como error.
    return { status: 413, ok: false, data: { title: 'El servidor cortó la conexión: la carga excede el tamaño permitido.' }, title: 'payload too large' };
  }
}

export async function myPromotions(v: QaVendor): Promise<PromotionRow[]> {
  const r = await raw(`/api/vendors/${v.vendorId}/promotions`, { token: await vendorJwt(v) });
  if (!r.ok) throw new Error(`listado -> ${r.status}`);
  return r.data as PromotionRow[];
}

export async function quote(v: QaVendor, startsOn: string, endsOn: string): Promise<{ days: number; pricePerDayCents: number; totalCents: number }> {
  const r = await raw(`/api/vendors/${v.vendorId}/promotions/quote?startsOn=${startsOn}&endsOn=${endsOn}`, { token: await vendorJwt(v) });
  if (!r.ok) throw new Error(`quote -> ${r.status}`);
  return r.data;
}

export const deactivate = async (v: QaVendor, id: number): Promise<Raw> =>
  raw(`/api/vendors/${v.vendorId}/promotions/${id}/deactivate`, { method: 'POST', token: await vendorJwt(v) });

export const reactivate = async (v: QaVendor, id: number): Promise<Raw> =>
  raw(`/api/vendors/${v.vendorId}/promotions/${id}/reactivate`, { method: 'POST', token: await vendorJwt(v) });

export const adminDeactivate = (adminToken: string, id: number, reason: string | null): Promise<Raw> =>
  raw(`/api/admin/promotions/${id}/deactivate`, { method: 'POST', token: adminToken, body: { reason } });

export const adminReactivate = (adminToken: string, id: number): Promise<Raw> =>
  raw(`/api/admin/promotions/${id}/reactivate`, { method: 'POST', token: adminToken });

export const getSettings = async (adminToken: string): Promise<PromoSettings> => {
  const r = await raw('/api/admin/promotions/settings', { token: adminToken });
  if (!r.ok) throw new Error(`settings -> ${r.status}`);
  return r.data;
};

export const putSettings = (adminToken: string, intervalSeconds: number, advertisingPricePerDayCents: number): Promise<Raw> =>
  raw('/api/admin/promotions/settings', { method: 'PUT', token: adminToken, body: { intervalSeconds, advertisingPricePerDayCents } });

export const publicSettings = async (): Promise<PromoSettings> => {
  const r = await raw('/api/promotions/settings');
  if (!r.ok) throw new Error(`public settings -> ${r.status}`);
  return r.data;
};

/// Lo que ve el consumidor en Santo Domingo (donde está la sucursal QA).
export const nearby = async (): Promise<PromotionRow[]> => {
  const r = await raw('/api/promotions/nearby?lat=18.4861&lng=-69.9312&radiusMeters=5000');
  if (!r.ok) throw new Error(`nearby -> ${r.status}`);
  return r.data as PromotionRow[];
};

export const nuevoCaption = (etiqueta: string) => `${etiqueta} QA ${Date.now()}${crypto.randomInt(100, 999)}`;
